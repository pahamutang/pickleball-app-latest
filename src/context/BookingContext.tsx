import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { supabase } from '../services/supabaseClient';
import { Reservation } from '../bookingTypes';

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
export interface MutationResult {
  ok: boolean;
  error?: string;
}

interface BookingContextValue {
  reservations: Reservation[];
  loading: boolean;
  addReservation: (reservation: Reservation) => Promise<MutationResult>;
  cancelReservation: (id: string) => Promise<MutationResult>;
  setPaid: (id: string, isPaid: boolean) => Promise<MutationResult>;
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
  if (lower.includes('row-level security') || lower.includes('policy')) {
    return "You don't have permission to do that.";
  }
  return raw;
}

export function BookingProvider({ children }: { children: ReactNode }) {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  // Guards against a realtime-triggered refetch racing a mutation we
  // already applied locally — harmless either way since fetchAll always
  // replaces the whole array with the server's truth, but avoids a
  // visible flicker.
  const fetchingRef = useRef(false);

  const fetchAll = async () => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    const { data, error } = await supabase
      .from('reservations')
      .select('id, customer_name, court, date, hours, players, notes, is_paid, created_by, created_at')
      .order('created_at', { ascending: true });
    fetchingRef.current = false;
    if (error) {
      console.warn('Failed to load reservations', error);
      return;
    }
    const rows = (data ?? []) as ReservationRow[];
    setReservations(rows.map(rowToReservation));
  };

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel('reservations-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reservations' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Confirmed by the database — reflect it locally right away instead
    // of waiting on the realtime round-trip. The next realtime event (or
    // this same insert's own event) will re-fetch and match this.
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
      value={{ reservations, loading, addReservation, cancelReservation, setPaid }}
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
