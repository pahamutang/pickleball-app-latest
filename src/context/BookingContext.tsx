import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../services/supabaseClient';
import { Reservation } from '../bookingTypes';
import { useAuth } from './AuthContext';

// Reservations are a shared Supabase table (see
// supabase_reservations_migration.sql) — the same row set is visible to
// the owner and to every player, kept live via realtime subscriptions.
//
// Unlike the old AsyncStorage version (or a naive "optimistic setState +
// push to DB in the background" version), every mutation here is a
// direct, awaited call to Supabase. Local state is only ever updated
// *after* the database confirms the write. That matters: if a write
// silently failed before, the booking would look like it worked on the
// device that made it, but never actually reach the database — so it
// would never show up anywhere else. Now a failed write returns an
// error the screen can show instead of pretending to have worked.
//
// Double-booking: BookingScreen still does a client-side conflict check
// right before calling addReservation, purely so the common case fails
// fast with a nice message before even hitting the network. That check
// is NOT what actually prevents two overlapping bookings, though — two
// clients racing each other could both pass it. The real guarantee comes
// from a database trigger (see supabase_double_booking_migration.sql)
// that takes a per-(court, date) advisory lock and re-checks for overlap
// inside the same transaction as the insert, so concurrent writes for the
// same court+date are serialized instead of racing. describeError() below
// recognizes that trigger's rejection and turns it into the same friendly
// copy the client-side check already uses.
export interface MutationResult {
  ok: boolean;
  error?: string;
}

// Grid-only view of a booking: which court/hour is taken and whether it's
// paid — no customer_name, no notes, no created_by. Sourced from the
// get_booked_slots(date) RPC (see supabase_double_booking_migration.sql),
// which is what lets a player see the whole park's availability grid
// without needing full SELECT access to every other customer's name and
// notes (see the privacy-fix migration for why that access is now
// restricted).
export interface BookedSlot {
  court: string;
  hour: number;
  isPaid: boolean;
}

interface BookingContextValue {
  // Full reservation rows — every column, including customer_name and
  // notes. For the owner this is every reservation in the park (that's
  // their job). For a player this is now ONLY the reservations THEY
  // created — see supabase_reservation_privacy_fix_migration.sql. It is
  // NOT a source of "is this slot free" for anyone but the owner anymore;
  // use getBookedSlots() for that.
  reservations: Reservation[];
  loading: boolean;
  // Bumped every time a realtime change comes in for `reservations`, so a
  // screen caching the result of getBookedSlots() (which isn't itself
  // realtime-subscribed) knows to re-fetch.
  changeVersion: number;
  // Privacy-safe availability grid for one date: every court/hour that's
  // taken park-wide, and whether it's paid, with no other customer's name
  // or notes attached. Works for both roles, but it's the ONLY way a
  // player can see whether courts/hours booked by OTHER people are free —
  // their own `reservations` no longer includes those rows at all.
  getBookedSlots: (date: string) => Promise<BookedSlot[]>;
  addReservation: (reservation: Reservation) => Promise<MutationResult>;
  cancelReservation: (id: string) => Promise<MutationResult>;
  setPaid: (id: string, isPaid: boolean) => Promise<MutationResult>;
  // Extends an existing reservation with more hours (and updated
  // players/notes) instead of creating a whole new row — used when
  // someone books more time on a court+date they already have an active
  // reservation on. Only ever touches hours/players/notes: is_paid,
  // court, date, customer_name, created_by are untouched here, and the
  // server enforces that a non-owner caller can't sneak a change into any
  // of those anyway (see supabase_reservation_merge_migration.sql).
  mergeReservationHours: (
    id: string,
    hours: number[],
    players: number,
    notes: string
  ) => Promise<MutationResult>;
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

type ReservationRow = {
  id: string;
  customer_name: string;
  court: string;
  date: string;
  hours: number[];
  players: number;
  notes: string;
  is_paid: boolean;
  created_by: string;
  created_at: string;
};

function rowToReservation(row: ReservationRow): Reservation {
  return {
    id: row.id,
    customerName: row.customer_name,
    court: row.court,
    date: row.date,
    hours: row.hours,
    players: row.players,
    notes: row.notes,
    isPaid: row.is_paid,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).getTime(),
  };
}

function describeError(error: unknown): string {
  const raw = (error as any)?.message as string | undefined;
  const code = (error as any)?.code as string | undefined;
  if (!raw) return 'Something went wrong. Please try again.';
  const lower = raw.toLowerCase();

  // Postgres/PostgREST error when the reservations table hasn't been
  // created yet (i.e. the SQL migration hasn't been run) — surfaced as
  // a specific, actionable message instead of a generic failure.
  //
  // PostgREST reports this two different ways depending on exactly what's
  // missing/stale:
  //  - "relation ... does not exist" — straight from Postgres, the table
  //    was genuinely never created.
  //  - PGRST205 "Could not find the table 'public.reservations' in the
  //    schema cache" — PostgREST's own cache doesn't know about the table,
  //    either because it still doesn't exist or because it was created
  //    after PostgREST last loaded its schema (needs a cache reload).
  // Both mean the same thing to the user: run the migration.
  if (
    (lower.includes('relation') && lower.includes('does not exist')) ||
    code === 'PGRST205' ||
    lower.includes('schema cache')
  ) {
    return "The reservations table hasn't been set up in Supabase yet (or Supabase hasn't picked up the change). Run supabase_fix_migration.sql in the Supabase SQL editor, then try again — it also refreshes Supabase's schema cache.";
  }

  // The double-booking trigger (see supabase_double_booking_migration.sql)
  // rejects the write with errcode 23505 (unique_violation) and a message
  // starting "This slot on ... was just booked by someone else." Match on
  // the code first (stable across message wording), falling back to the
  // message text in case the code ever comes through differently.
  if (code === '23505' || lower.includes('was just booked by someone else')) {
    return 'This slot was just booked by someone else. Please choose another time.';
  }

  if (lower.includes('row-level security') || lower.includes('policy')) {
    return "You don't have permission to do that.";
  }
  return raw;
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const { session, profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  // Incremented on every realtime `reservations` change, purely so a
  // screen that cached a getBookedSlots() result (not itself realtime,
  // since it's a plain RPC call, not a subscribed table read) knows a
  // fresh call might return something different now.
  const [changeVersion, setChangeVersion] = useState(0);
  // Coalesces overlapping refetch requests instead of dropping them.
  // A single multi-court merge/insert (see BookingScreen.handleReserve)
  // fires several sequential writes, each of which triggers its own
  // realtime postgres_changes event -> fetchAll() call. If a fetch is
  // still in flight when the next event arrives, we must NOT just bail
  // out and forget about it — that used to leave `reservations` stuck
  // missing whichever update raced the in-flight fetch (e.g. one of the
  // merged courts silently showing its pre-merge hours) until some
  // unrelated future change happened to trigger another fetch. Instead,
  // remember that another fetch was requested and immediately run one
  // more right after the current one finishes, so we always eventually
  // converge on the server's latest truth.
  const fetchingRef = useRef(false);
  const refetchPendingRef = useRef(false);

  // What columns/rows this account is even allowed to read in full — see
  // supabase_reservation_privacy_fix_migration.sql. The owner still reads
  // every reservation (that's the job). A player's own full rows are all
  // they get here now; every OTHER customer's court/hour availability
  // comes from getBookedSlots() below instead, which never returns a
  // name or notes for anyone.
  const fetchAll = async () => {
    if (fetchingRef.current) {
      refetchPendingRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      do {
        refetchPendingRef.current = false;
        let query = supabase
          .from('reservations')
          .select('id, customer_name, court, date, hours, players, notes, is_paid, created_by, created_at')
          .order('created_at', { ascending: true });
        if (!isOwner && session) {
          query = query.eq('created_by', session.user.id);
        }
        const { data, error } = await query;
        if (error) {
          console.warn('Failed to load reservations', error);
          break;
        }
        const rows = (data ?? []) as ReservationRow[];
        setReservations(rows.map(rowToReservation));
      } while (refetchPendingRef.current);
    } finally {
      fetchingRef.current = false;
    }
  };

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel('reservations-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, () => {
        setChangeVersion((v) => v + 1);
        fetchAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // Deliberately re-runs if role flips (e.g. claiming owner mid-session)
    // so the fetch scope above (all rows vs. own-only) picks up the new
    // role instead of staying stuck on whatever it was at first mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner, session?.user.id]);

  const getBookedSlots = useCallback(async (date: string): Promise<BookedSlot[]> => {
    const { data, error } = await supabase.rpc('get_booked_slots', { p_date: date });
    if (error) {
      console.warn('Failed to load booked slots', error);
      return [];
    }
    return ((data ?? []) as { court: string; hour: number; is_paid: boolean }[]).map((r) => ({
      court: r.court,
      hour: r.hour,
      isPaid: r.is_paid,
    }));
  }, []);

  const addReservation = async (reservation: Reservation): Promise<MutationResult> => {
    const { error } = await supabase.from('reservations').insert({
      id: reservation.id,
      customer_name: reservation.customerName,
      court: reservation.court,
      date: reservation.date,
      hours: reservation.hours,
      players: reservation.players,
      notes: reservation.notes,
      is_paid: reservation.isPaid,
      created_by: reservation.createdBy,
    });
    if (error) {
      console.warn('Failed to save reservation', error);
      return { ok: false, error: describeError(error) };
    }
    // Confirmed by the database (including the double-booking trigger) —
    // reflect it locally right away instead of waiting on the realtime
    // round-trip. The next realtime event (or this same insert's own
    // event) will re-fetch and match this.
    setReservations((prev) =>
      prev.some((r) => r.id === reservation.id) ? prev : [...prev, reservation]
    );
    return { ok: true };
  };

  const cancelReservation = async (id: string): Promise<MutationResult> => {
    const { error } = await supabase.from('reservations').delete().eq('id', id);
    if (error) {
      console.warn('Failed to cancel reservation', error);
      return { ok: false, error: describeError(error) };
    }
    setReservations((prev) => prev.filter((r) => r.id !== id));
    return { ok: true };
  };

  const mergeReservationHours = async (
    id: string,
    hours: number[],
    players: number,
    notes: string
  ): Promise<MutationResult> => {
    const { error } = await supabase
      .from('reservations')
      .update({ hours, players, notes })
      .eq('id', id);
    if (error) {
      console.warn('Failed to merge reservation', error);
      return { ok: false, error: describeError(error) };
    }
    setReservations((prev) =>
      prev.map((r) => (r.id === id ? { ...r, hours, players, notes } : r))
    );
    return { ok: true };
  };

  const setPaid = async (id: string, isPaid: boolean): Promise<MutationResult> => {
    const { error } = await supabase.from('reservations').update({ is_paid: isPaid }).eq('id', id);
    if (error) {
      console.warn('Failed to update paid status', error);
      return { ok: false, error: describeError(error) };
    }
    setReservations((prev) => prev.map((r) => (r.id === id ? { ...r, isPaid } : r)));
    return { ok: true };
  };

  return (
    <BookingContext.Provider
      value={{
        reservations,
        loading,
        changeVersion,
        getBookedSlots,
        addReservation,
        cancelReservation,
        setPaid,
        mergeReservationHours,
      }}
    >
      {children}
    </BookingContext.Provider>
  );
}

export function useBooking() {
  const ctx = useContext(BookingContext);
  if (!ctx) {
    throw new Error('useBooking must be used within a BookingProvider');
  }
  return ctx;
}
