import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppColors } from '../colors';
import { useAuth } from '../context/AuthContext';
import { useBooking, BookedSlot } from '../context/BookingContext';
import {
  COURTS,
  Court,
  RATE_TIERS,
  Reservation,
  SLOT_SECTIONS,
  TIME_SLOTS,
  addDays,
  courtByName,
  formatDateChip,
  formatFriendlyDate,
  isPastSlot,
  nextDays,
  rateForSlot,
  reservationTotal,
  slotLabelsForHours,
  toIsoDate,
  todayIso,
} from '../bookingTypes';
import { generateId } from '../types';
import { formatCurrency } from '../utils/currency';
import VenuePhotoCarousel from '../components/VenuePhotoCarousel';
import VenuePhotoManagerModal from '../components/VenuePhotoManagerModal';
import { useVenuePhotos } from '../context/VenuePhotosContext';
import { buildVenueSlides } from '../utils/venueSlides';
import VenueLocationCard from '../components/VenueLocationCard';
import CancelReservationModal from '../components/CancelReservationModal';
import AlertModal from '../components/AlertModal';
import ReservationConfirmedModal from '../components/ReservationConfirmedModal';
import CalendarPickerModal from '../components/CalendarPickerModal';
import NotificationBell from '../components/NotificationBell';
import UpcomingReservationsModal from '../components/UpcomingReservationsModal';

const DATE_STRIP_DAYS = 14;

const AMENITIES = [
  'Parking',
  'Restrooms',
  'Waiting Area',
  'Paddle Rentals',
  'Drinking Water',
  'Well-Lit Courts',
];
const CONTACT = {
  phone: '+63 970 650 2797',
  address: 'Sitio Mabago, Carmen, 6319 Bohol, Philippines',
  facebook: 'facebook.com/mtpicklepark',
};
const VENUE_LOCATION = {
  latitude: 9.8139893,
  longitude: 124.19545569999998,
  placeId: 'ChIJ4RbZHxsXqjMRPRpPUV8lpxg',
};

type CellStatus = 'past' | 'booked' | 'pending' | 'selected' | 'available';

// `onOpenLegacy` only ever gets passed (and only ever gets rendered) from
// the owner's app shell — a player's account never receives it, so
// there's no path from here into the owner's payment tracker for them.
// `onOpenBill` is the reverse: only a player's app shell passes it, so
// only players see the "My Bill" shortcut up here.
export default function BookingScreen({
  onOpenLegacy,
  onOpenBill,
}: {
  onOpenLegacy?: () => void;
  onOpenBill?: () => void;
}) {
  const {
    reservations,
    loading,
    changeVersion,
    getBookedSlots,
    addReservation,
    cancelReservation,
    setPaid,
    mergeReservationHours,
  } = useBooking();
  const { session, profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const { photos: venuePhotos } = useVenuePhotos();
  const carouselPhotos = useMemo(
    () => buildVenueSlides(venuePhotos).map((slide) => slide.source),
    [venuePhotos]
  );
  const [showPhotoManager, setShowPhotoManager] = useState(false);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const myName = profile?.display_name?.trim() || '';

  const dates = useMemo(() => nextDays(DATE_STRIP_DAYS), []);
  const today = todayIso();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [showDateStrip, setShowDateStrip] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  // Selected hours, keyed by court name — e.g. { 'Court 1': [7, 8], 'Court 3': [7] }.
  // A court with no selection is either absent from this map or maps to [].
  // This lets a single booking cover multiple courts at once (e.g. Court 1
  // AND Court 3 for the same time slot), instead of being locked to one
  // court like the old `selectedCourt` + `selectedHours` pair was.
  const [selectedSlots, setSelectedSlots] = useState<Record<string, number[]>>({});
  // Free text for everyone, owner and player alike — pre-filled with the
  // player's own profile name as a convenient default, but always
  // editable and replaceable. It used to be locked to the player's
  // account name (no typing allowed), which meant a stale or wrong
  // profile display_name (e.g. "Test" left over from account setup)
  // could never be corrected here — every booking silently went out
  // under that name no matter what the player intended to type.
  const [customerName, setCustomerName] = useState(isOwner ? '' : myName);
  const [players, setPlayers] = useState(2);
  // Tapping the player count switches it from a display Text into an
  // editable TextInput pre-filled with the current number, so someone
  // with e.g. 20 players doesn't have to tap "+" eighteen times — they
  // can just type the exact number. `playersText` holds the in-progress
  // typed value (kept separate from `players` so a half-typed/invalid
  // value never leaks into the actual reservation before it's confirmed).
  const [editingPlayers, setEditingPlayers] = useState(false);
  const [playersText, setPlayersText] = useState('2');
  const [notes, setNotes] = useState('');
  const [pendingCancel, setPendingCancel] = useState<Reservation | null>(null);

  // Dropping the date resets any in-progress slot selection — a selection
  // made for one date should never silently apply to another.
  useEffect(() => {
    setSelectedSlots({});
  }, [selectedDate]);

  // Every reservation on this date, in full (name, notes, etc) —
  // everyone reads every row now (see BookingContext / the
  // full-visibility migration). The merge-match below still only ever
  // matches a row this account itself created (see the `!isOwner`
  // createdBy check a bit further down), so seeing everyone's rows here
  // doesn't risk merging into a stranger's booking.
  const reservationsForDate = useMemo(
    () => reservations.filter((r) => r.date === selectedDate),
    [reservations, selectedDate]
  );

  // Park-wide availability for the selected date — every court/hour
  // that's taken and whether it's paid (sourced from the
  // get_booked_slots RPC). `reservationsForDate` above now also reflects
  // this directly since everyone reads every row, but this RPC is still
  // used for the fast pre-submit conflict check since it's a single
  // lightweight call.
  const [bookedSlots, setBookedSlots] = useState<BookedSlot[]>([]);
  useEffect(() => {
    let cancelled = false;
    getBookedSlots(selectedDate).then((slots) => {
      if (!cancelled) setBookedSlots(slots);
    });
    return () => {
      cancelled = true;
    };
    // Re-fetches whenever the date changes, and whenever a realtime
    // reservations change comes in (changeVersion) — this RPC call isn't
    // itself realtime-subscribed, so without that second dependency the
    // grid would go stale the moment someone else booked or cancelled a
    // slot instead of updating live like the rest of the screen.
  }, [selectedDate, changeVersion, getBookedSlots]);

  const cellStatus = (court: Court, hour: number): CellStatus => {
    if (isPastSlot(selectedDate, hour)) return 'past';
    const match = bookedSlots.find((s) => s.court === court.name && s.hour === hour);
    if (match) return match.isPaid ? 'booked' : 'pending';
    if ((selectedSlots[court.name] ?? []).includes(hour)) return 'selected';
    return 'available';
  };

  const handleCellPress = (court: Court, hour: number) => {
    const status = cellStatus(court, hour);
    if (status === 'past' || status === 'booked' || status === 'pending') return;

    // Toggle this hour within *this court's own* selection only — every
    // other court's selection is left untouched, so a player can select
    // Court 1's 7-8 AM slot, then Court 2's and Court 3's 7-8 AM slots too,
    // and book all three in one go.
    setSelectedSlots((prev) => {
      const current = prev[court.name] ?? [];
      const next = current.includes(hour)
        ? current.filter((h) => h !== hour)
        : [...current, hour].sort((a, b) => a - b);
      const updated = { ...prev, [court.name]: next };
      if (next.length === 0) delete updated[court.name];
      return updated;
    });
  };

  // Courts that currently have at least one hour selected, in COURTS order
  // (not object-key order, which isn't guaranteed to match the grid).
  const activeCourtNames = COURTS.map((c) => c.name).filter(
    (name) => (selectedSlots[name] ?? []).length > 0
  );
  const totalSelectedSlots = activeCourtNames.reduce(
    (sum, name) => sum + selectedSlots[name].length,
    0
  );
  const total = activeCourtNames.reduce((sum, name) => {
    const court = courtByName(name);
    return sum + selectedSlots[name].reduce((s, h) => s + rateForSlot(court, h), 0);
  }, 0);

  const resetForm = () => {
    setSelectedSlots({});
    setCustomerName(isOwner ? '' : myName);
    setPlayers(2);
    setPlayersText('2');
    setEditingPlayers(false);
    setNotes('');
  };

  // A sane upper bound just to stop a mistyped/garbage value (e.g. an
  // accidental extra digit) from producing something absurd — not a real
  // limit on group size, which the courts obviously can't fit 8 of anyway
  // but a big private event booking every court could plausibly exceed 8.
  const MAX_REASONABLE_PLAYERS = 200;

  const commitPlayersText = () => {
    const parsed = parseInt(playersText.trim(), 10);
    const clamped =
      isNaN(parsed) || parsed < 1 ? players : Math.min(MAX_REASONABLE_PLAYERS, parsed);
    setPlayers(clamped);
    setPlayersText(String(clamped));
    setEditingPlayers(false);
  };

  const [alertState, setAlertState] = useState<{
    variant: 'error' | 'warning' | 'info';
    title: string;
    message: string;
  } | null>(null);
  const [confirmedReservations, setConfirmedReservations] = useState<Reservation[] | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleReserve = async () => {
    const trimmedName = customerName.trim();
    if (!trimmedName) {
      setAlertState({
        variant: 'error',
        title: 'Name required',
        message: "Please enter the customer's name for this reservation.",
      });
      return;
    }
    if (!session) {
      setAlertState({
        variant: 'error',
        title: 'Sign in required',
        message: 'Please sign in again to book a court.',
      });
      return;
    }
    if (activeCourtNames.length === 0) {
      setAlertState({
        variant: 'warning',
        title: 'Pick a time',
        message: 'Please select at least one time slot to reserve.',
      });
      return;
    }
    // Re-check against the latest availability right before saving, in
    // case something else got booked in the moments since the slots were
    // picked — a fresh RPC call, not the (possibly a render or two stale)
    // `bookedSlots` state, and not `reservationsForDate` (which, for a
    // player, no longer contains any OTHER customer's booking at all —
    // see BookingContext). Checked per-court, since each court now has
    // its own independent selection of hours. This is still just a nice
    // fast-fail for the common case, same as before: the real guarantee
    // against a race is the database trigger in
    // supabase_double_booking_migration.sql.
    const latestBookedSlots = await getBookedSlots(selectedDate);
    const conflict = activeCourtNames.some((courtName) =>
      selectedSlots[courtName].some((h) =>
        latestBookedSlots.some((s) => s.court === courtName && s.hour === h)
      )
    );
    if (conflict) {
      setAlertState({
        variant: 'warning',
        title: 'Slot no longer available',
        message: 'One of the selected time slots was just booked by someone else. Please choose another.',
      });
      setSelectedSlots({});
      return;
    }

    // One reservation row per selected court (the backend model ties a
    // reservation to a single court). But if this same booker (same
    // account, same customer name) already has an active reservation for
    // a court+date they've picked more hours on, extend that existing row
    // instead of creating a duplicate one — otherwise "My Reservations"
    // fills up with a separate card every time someone adds more time to
    // a court they already booked that day, whether or not the earlier
    // booking has been paid yet.
    //
    // This auto-merge is only safe for a player booking under their own
    // account: there, `session.user.id` really does uniquely identify one
    // person, and the name match is just extra confirmation on top of
    // that. For an OWNER, `session.user.id` is the owner's own id on
    // every single booking they create — they're booking on behalf of
    // walk-in customers, not themselves — so matching by
    // `createdBy === session.user.id` collapses to matching on name
    // alone. Two different real customers can easily share a name (e.g.
    // "Juan Dela Cruz"), and if both book the same court on the same day,
    // the second booking would silently merge into the first's row,
    // combining their hours, bumping their player count, and appending
    // their notes onto a stranger's reservation. So owner bookings always
    // get their own row — no auto-merge — and two different customers can
    // never accidentally collide.
    type PlannedMerge = {
      existing: Reservation;
      mergedHours: number[];
      mergedPlayers: number;
      mergedNotes: string;
    };
    const merges: PlannedMerge[] = [];
    const inserts: Reservation[] = [];

    for (const courtName of activeCourtNames) {
      const existing = !isOwner
        ? reservationsForDate.find(
            (r) =>
              r.court === courtName &&
              r.createdBy === session.user.id &&
              r.customerName.trim().toLowerCase() === trimmedName.toLowerCase()
          )
        : undefined;
      if (existing) {
        const mergedHours = Array.from(new Set([...existing.hours, ...selectedSlots[courtName]])).sort(
          (a, b) => a - b
        );
        const trimmedNotes = notes.trim();
        const mergedNotes =
          trimmedNotes && trimmedNotes !== existing.notes
            ? existing.notes
              ? `${existing.notes}; ${trimmedNotes}`
              : trimmedNotes
            : existing.notes;
        merges.push({
          existing,
          mergedHours,
          mergedPlayers: Math.max(existing.players, players),
          mergedNotes,
        });
      } else {
        inserts.push({
          id: generateId(),
          customerName: trimmedName,
          court: courtName,
          date: selectedDate,
          hours: selectedSlots[courtName],
          players,
          notes: notes.trim(),
          isPaid: false,
          createdAt: Date.now(),
          createdBy: session.user.id,
        });
      }
    }

    setSubmitting(true);

    const succeededMerges: PlannedMerge[] = [];
    const succeededInserts: Reservation[] = [];
    let failure: string | undefined;

    for (const m of merges) {
      const result = await mergeReservationHours(
        m.existing.id,
        m.mergedHours,
        m.mergedPlayers,
        m.mergedNotes
      );
      if (!result.ok) {
        failure = result.error;
        break;
      }
      succeededMerges.push(m);
    }

    if (!failure) {
      for (const reservation of inserts) {
        const result = await addReservation(reservation);
        if (!result.ok) {
          failure = result.error;
          break;
        }
        succeededInserts.push(reservation);
      }
    }

    if (failure) {
      // Don't leave a half-booked state — undo everything this action
      // touched: merged reservations get their pre-merge hours/players/
      // notes restored, and any fresh inserts get cancelled. Either the
      // player gets every court they asked for, or none of them.
      await Promise.all([
        ...succeededMerges.map((m) =>
          mergeReservationHours(m.existing.id, m.existing.hours, m.existing.players, m.existing.notes)
        ),
        ...succeededInserts.map((r) => cancelReservation(r.id)),
      ]);
      setSubmitting(false);
      setAlertState({
        variant: 'error',
        title: "Couldn't save reservation",
        message: failure ?? 'Please check your connection and try again.',
      });
      return;
    }

    setSubmitting(false);
    resetForm();
    // Confirmation shows every court this action touched — for a merged
    // court, that's its full updated hour list (old + new), not just the
    // hours just added, so the player sees exactly what's reserved now.
    setConfirmedReservations([
      ...succeededMerges.map((m) => ({
        ...m.existing,
        hours: m.mergedHours,
        players: m.mergedPlayers,
        notes: m.mergedNotes,
      })),
      ...succeededInserts,
    ]);
  };

  // Only the owner can flip paid status — enforced here for the UI, and
  // again server-side by RLS, since players never even see a pressable
  // chip (see the PaidChip usage below).
  const togglePaid = async (reservation: Reservation) => {
    if (!isOwner) return;
    const result = await setPaid(reservation.id, !reservation.isPaid);
    if (!result.ok) {
      setAlertState({
        variant: 'error',
        title: "Couldn't update payment status",
        message: result.error ?? 'Please check your connection and try again.',
      });
    }
  };

  const canCancel = (reservation: Reservation) =>
    isOwner || reservation.createdBy === session?.user.id;

  const deleteReservation = (reservation: Reservation) => {
    if (!canCancel(reservation)) return;
    setPendingCancel(reservation);
  };

  const confirmCancelReservation = async () => {
    if (!pendingCancel) return;
    const target = pendingCancel;
    setPendingCancel(null);
    const result = await cancelReservation(target.id);
    if (!result.ok) {
      setAlertState({
        variant: 'error',
        title: "Couldn't cancel reservation",
        message: result.error ?? 'Please check your connection and try again.',
      });
    }
  };

  // Everyone — owner and players alike — sees the whole park's upcoming
  // bookings now (see supabase_reservation_full_visibility_migration.sql).
  // Who can act on a given card (Cancel, mark paid) is still gated
  // separately by canCancel/isOwner below.
  const upcoming = useMemo(() => {
    return reservations
      .filter((r) => r.date >= today)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return Math.min(...a.hours) - Math.min(...b.hours);
      });
  }, [reservations, today]);

  // Groups `upcoming` by (booker + customer name + date) — the same key
  // the merge logic above uses to recognize "the same booking session" —
  // so a player who reserved several different courts the same day sees
  // one card listing every court instead of one card per court cluttering
  // the list.
  const upcomingGroups = useMemo(() => {
    const groups = new Map<
      string,
      { key: string; customerName: string; date: string; items: Reservation[]; total: number }
    >();
    for (const r of upcoming) {
      const key = `${r.createdBy}|${r.date}|${r.customerName.trim().toLowerCase()}`;
      const existing = groups.get(key);
      if (existing) {
        existing.items.push(r);
        existing.total += reservationTotal(r);
      } else {
        groups.set(key, {
          key,
          customerName: r.customerName,
          date: r.date,
          items: [r],
          total: reservationTotal(r),
        });
      }
    }
    // `upcoming` is already sorted by date then earliest hour, and Map
    // preserves insertion order, so groups come out in the same
    // chronological order the flat list used to.
    return Array.from(groups.values());
  }, [upcoming]);

  if (loading) {
    return (
      <View style={[styles.screen, styles.loadingScreen]}>
        <ActivityIndicator size="large" color={AppColors.forestGreen} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.appBar}>
        <View style={styles.appBarLeft}>
          <Image source={require('../../assets/mt_pickle_logo.jpg')} style={styles.logo} />
          <View>
            <Text style={styles.appBarTitle}>Mt Pickle Park</Text>
            <Text style={styles.appBarSubtitle}>COURT RESERVATION</Text>
          </View>
        </View>
        {isOwner && (
          <View style={styles.appBarOwnerRight}>
            <NotificationBell />
            {onOpenLegacy && (
              <Pressable
                onPress={onOpenLegacy}
                style={styles.legacyButton}
                accessibilityLabel="Open Payment Tracker (session mode)"
                accessibilityRole="button"
              >
                <Text style={styles.legacyButtonText}>💳 Payment Tracker</Text>
              </Pressable>
            )}
          </View>
        )}
        {!isOwner && onOpenBill && (
          <Pressable
            onPress={onOpenBill}
            style={styles.legacyButton}
            accessibilityLabel="Open My Bill"
            accessibilityRole="button"
          >
            <Text style={styles.legacyButtonText}>🧾 My Bill</Text>
          </Pressable>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {/* Photo carousel — real shots of the courts, swipeable with a page counter */}
        <VenuePhotoCarousel
          photos={carouselPhotos}
          onManagePress={isOwner ? () => setShowPhotoManager(true) : undefined}
        />

        {/* Venue header — name, location, like a venue card */}
        <View style={styles.venueCard}>
          <Image source={require('../../assets/mt_pickle_logo.jpg')} style={styles.venuePhoto} />
          <View style={{ flex: 1 }}>
            <Text style={styles.venueName}>Mt Pickle Park</Text>
            <Text style={styles.venueLocation}>📍 {CONTACT.address}</Text>
          </View>
        </View>

        {/* Date navigator — prev/next arrows + tap to open the quick-jump
            strip, plus a calendar button for jumping straight to any
            future date (e.g. next week) without stepping through days. */}
        <View style={styles.dateNav}>
          <View style={styles.dateNavSteppers}>
            <Pressable
              onPress={() => setSelectedDate((d) => (d > today ? addDays(d, -1) : d))}
              disabled={selectedDate <= today}
              style={[styles.dateNavArrow, selectedDate <= today && styles.dateNavArrowDisabled]}
              accessibilityRole="button"
              accessibilityLabel="Previous day"
            >
              <Text style={styles.dateNavArrowText}>‹</Text>
            </Pressable>
            <Pressable
              onPress={() => setShowDateStrip((s) => !s)}
              style={styles.dateNavLabel}
              accessibilityRole="button"
            >
              <Text style={styles.dateNavLabelText}>← {formatFriendlyDate(selectedDate)}</Text>
            </Pressable>
            <Pressable
              onPress={() => setSelectedDate((d) => addDays(d, 1))}
              style={styles.dateNavArrow}
              accessibilityRole="button"
              accessibilityLabel="Next day"
            >
              <Text style={styles.dateNavArrowText}>›</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => {
              setShowDateStrip(false);
              setShowCalendar(true);
            }}
            style={styles.calendarButton}
            accessibilityRole="button"
            accessibilityLabel="Open calendar to pick a date"
          >
            <Text style={styles.calendarButtonText}>📅</Text>
          </Pressable>
        </View>

        <CalendarPickerModal
          visible={showCalendar}
          selectedDate={selectedDate}
          onSelect={(iso) => {
            setSelectedDate(iso);
            setShowCalendar(false);
          }}
          onClose={() => setShowCalendar(false)}
        />

        {showDateStrip && (
          <FlatList
            horizontal
            data={dates}
            keyExtractor={(d) => toIsoDate(d)}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, paddingBottom: 12 }}
            renderItem={({ item }) => {
              const iso = toIsoDate(item);
              const { weekday, day, month } = formatDateChip(item);
              const active = iso === selectedDate;
              return (
                <Pressable
                  onPress={() => {
                    setSelectedDate(iso);
                    setShowDateStrip(false);
                  }}
                  style={[styles.dateChip, active && styles.dateChipActive]}
                  accessibilityRole="button"
                >
                  <Text style={[styles.dateChipWeekday, active && styles.dateChipTextActive]}>
                    {weekday}
                  </Text>
                  <Text style={[styles.dateChipDay, active && styles.dateChipTextActive]}>{day}</Text>
                  <Text style={[styles.dateChipWeekday, active && styles.dateChipTextActive]}>
                    {month}
                  </Text>
                </Pressable>
              );
            }}
          />
        )}

        {/* Rate summary bar */}
        <View style={styles.rateBar}>
          {RATE_TIERS.map((t) => (
            <View key={t.label} style={styles.rateChip}>
              <Text style={styles.rateChipLabel}>{t.label}</Text>
              <Text style={styles.rateChipValue}>
                {t.outdoorRate === t.indoorRate
                  ? formatCurrency(t.outdoorRate)
                  : `${formatCurrency(t.outdoorRate)}–${formatCurrency(t.indoorRate)}`}
              </Text>
              <Text style={styles.rateChipHours}>
                {formatHourRange(t.startHour, t.endHour)}
              </Text>
            </View>
          ))}
        </View>

        {/* Courts x time-slot availability grid */}
        <Text style={styles.sectionTitle}>Availability</Text>
        <View style={styles.gridWrap}>
          <View style={styles.gridHeaderRow}>
            <View style={styles.timeColSpacer} />
            {COURTS.map((c) => (
              <View
                key={c.name}
                style={[
                  styles.courtHeaderCell,
                  (selectedSlots[c.name] ?? []).length > 0 && styles.courtHeaderCellActive,
                ]}
              >
                <Text style={styles.courtHeaderName}>{c.name}</Text>
                <Text style={styles.courtHeaderType}>{c.type}</Text>
              </View>
            ))}
          </View>

          {SLOT_SECTIONS.map((section) => {
            const slots = TIME_SLOTS.filter((s) => s.section === section);
            if (slots.length === 0) return null;
            return (
              <View key={section}>
                <Text style={styles.sectionLabel}>{section.toUpperCase()}</Text>
                {slots.map((slot) => (
                  <View key={slot.hour} style={styles.gridRow}>
                    <View style={styles.timeCol}>
                      <Text style={styles.timeColText}>{slot.label}</Text>
                    </View>
                    {COURTS.map((court) => {
                      const status = cellStatus(court, slot.hour);
                      return (
                        <Pressable
                          key={court.name}
                          onPress={() => handleCellPress(court, slot.hour)}
                          disabled={status === 'past' || status === 'booked' || status === 'pending'}
                          style={[styles.cell, cellStyleFor(status)]}
                          accessibilityRole="button"
                          accessibilityLabel={`${court.name}, ${slot.label}, ${status}`}
                        >
                          <Text style={cellTextStyleFor(status)}>{cellLabelFor(status)}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            );
          })}
        </View>

        {/* Legend */}
        <View style={styles.legendRow}>
          <LegendDot color="#DFF5E3" border="#8FD9A3" label="Available" />
          <LegendDot color={AppColors.gold} label="Selected" />
          <LegendDot color="#FCE8A6" label="Reserved" />
          <LegendDot color="#D8D8D8" label="Booked" />
          <LegendDot color="#F0F0F0" label="Unavailable" />
        </View>

        {/* Booking summary — appears once at least one slot is selected on
            any court. Lists every selected court separately since each one
            can have its own set of hours. */}
        {activeCourtNames.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>
              {activeCourtNames.join(', ')} · {formatFriendlyDate(selectedDate)}
            </Text>
            {activeCourtNames.map((courtName) => (
              <Text key={courtName} style={styles.summarySlots}>
                {courtName}: {slotLabelsForHours(selectedSlots[courtName]).join(', ')}
              </Text>
            ))}

            <Text style={styles.label}>{isOwner ? 'Customer name' : 'Booking under'}</Text>
            <TextInput
              value={customerName}
              onChangeText={setCustomerName}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor="#999"
              style={styles.input}
            />

            <Text style={styles.label}>Players</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => {
                  const next = Math.max(1, players - 1);
                  setPlayers(next);
                  setPlayersText(String(next));
                }}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="Decrease player count"
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </Pressable>

              {editingPlayers ? (
                <TextInput
                  value={playersText}
                  onChangeText={setPlayersText}
                  onBlur={commitPlayersText}
                  onSubmitEditing={commitPlayersText}
                  keyboardType="number-pad"
                  autoFocus
                  selectTextOnFocus
                  style={styles.stepperInput}
                  accessibilityLabel="Type exact number of players"
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setPlayersText(String(players));
                    setEditingPlayers(true);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Player count ${players}, tap to type an exact number`}
                >
                  <Text style={styles.stepperValue}>{players}</Text>
                </Pressable>
              )}

              <Pressable
                onPress={() => {
                  const next = Math.min(MAX_REASONABLE_PLAYERS, players + 1);
                  setPlayers(next);
                  setPlayersText(String(next));
                }}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="Increase player count"
              >
                <Text style={styles.stepperButtonText}>＋</Text>
              </Pressable>
            </View>

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              placeholder="Anything the staff should know"
              placeholderTextColor="#999"
              style={styles.input}
            />

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>
                {totalSelectedSlots} slot{totalSelectedSlots === 1 ? '' : 's'} selected
                {activeCourtNames.length > 1 ? ` across ${activeCourtNames.length} courts` : ''}
              </Text>
              <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
            </View>

            <Pressable
              onPress={handleReserve}
              disabled={submitting}
              style={[styles.reserveButton, submitting && styles.reserveButtonDisabled]}
              accessibilityRole="button"
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reserveButtonText}>Reserve Court</Text>
              )}
            </Pressable>
          </View>
        )}

        {/* Upcoming reservations — button opens the full list in a modal
            instead of stacking every booking inline, so a busy day with
            lots of reservations doesn't push the rest of the home screen
            further and further down. */}
        <Text style={styles.sectionTitle}>Upcoming Reservations</Text>
        <Pressable
          onPress={() => setShowUpcoming(true)}
          style={styles.upcomingButton}
          accessibilityRole="button"
          accessibilityLabel={`View upcoming reservations, ${upcomingGroups.length} total`}
        >
          <Text style={styles.upcomingButtonText}>
            {upcomingGroups.length === 0
              ? 'No upcoming reservations yet'
              : `View Upcoming Reservations (${upcomingGroups.length})`}
          </Text>
          {upcomingGroups.length > 0 && <Text style={styles.upcomingButtonChevron}>›</Text>}
        </Pressable>

        {/* Venue info — amenities, contact, location */}
        <Text style={styles.sectionTitle}>About This Venue</Text>
        <View style={styles.infoCard}>
          <Text style={styles.infoHeading}>Amenities</Text>
          <View style={styles.amenityWrap}>
            {AMENITIES.map((a) => (
              <View key={a} style={styles.amenityTag}>
                <Text style={styles.amenityTagText}>{a}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.infoHeading, { marginTop: 16 }]}>Contact</Text>
          <Text style={styles.infoLine}>📞 {CONTACT.phone}</Text>
          <Text style={styles.infoLine}>📍 {CONTACT.address}</Text>
          <Text style={styles.infoLine}>👍 {CONTACT.facebook}</Text>
        </View>

        <View style={{ marginHorizontal: 16, marginTop: 16 }}>
          <VenueLocationCard
            address={CONTACT.address}
            latitude={VENUE_LOCATION.latitude}
            longitude={VENUE_LOCATION.longitude}
            placeId={VENUE_LOCATION.placeId}
          />
        </View>
      </ScrollView>

      <CancelReservationModal
        visible={!!pendingCancel}
        customerName={pendingCancel?.customerName ?? ''}
        courtName={pendingCancel?.court ?? ''}
        dateLabel={pendingCancel ? formatFriendlyDate(pendingCancel.date) : ''}
        onKeep={() => setPendingCancel(null)}
        onConfirm={confirmCancelReservation}
      />

      <ReservationConfirmedModal
        reservations={confirmedReservations}
        onClose={() => setConfirmedReservations(null)}
      />

      <AlertModal
        visible={!!alertState}
        variant={alertState?.variant ?? 'info'}
        title={alertState?.title ?? ''}
        message={alertState?.message ?? ''}
        onClose={() => setAlertState(null)}
      />

      {isOwner && (
        <VenuePhotoManagerModal
          visible={showPhotoManager}
          onClose={() => setShowPhotoManager(false)}
        />
      )}

      <UpcomingReservationsModal
        visible={showUpcoming}
        onClose={() => setShowUpcoming(false)}
        groups={upcomingGroups}
        isOwner={isOwner}
        canCancel={canCancel}
        onTogglePaid={togglePaid}
        onCancel={(r) => {
          // Close this modal first so the confirmation dialog opened by
          // deleteReservation isn't stacked on top of it — same
          // convention PlayerCard follows for its own nested modal
          // (OrdersModal -> edit-order modal), for the same reason:
          // two simultaneously-visible <Modal>s is a known rough edge
          // on this app's RN setup.
          setShowUpcoming(false);
          deleteReservation(r);
        }}
      />
    </View>
  );
}

function formatHourRange(startHour: number, endHour: number): string {
  const fmt = (h: number) => {
    const hh = ((h + 11) % 12) + 1;
    const ampm = h >= 12 && h < 24 ? 'PM' : 'AM';
    return `${hh}${ampm}`;
  };
  return `${fmt(startHour)}-${fmt(endHour)}`;
}

function cellLabelFor(status: CellStatus): string {
  switch (status) {
    case 'booked':
      return 'Booked';
    case 'pending':
      return 'Reserved';
    case 'past':
      return '—';
    case 'selected':
      return '✓';
    default:
      return '';
  }
}

function cellStyleFor(status: CellStatus) {
  switch (status) {
    case 'booked':
      return styles.cellBooked;
    case 'pending':
      return styles.cellPending;
    case 'past':
      return styles.cellPast;
    case 'selected':
      return styles.cellSelected;
    default:
      return styles.cellAvailable;
  }
}

function cellTextStyleFor(status: CellStatus) {
  switch (status) {
    case 'booked':
      return styles.cellTextBooked;
    case 'pending':
      return styles.cellTextPending;
    case 'past':
      return styles.cellTextPast;
    case 'selected':
      return styles.cellTextSelected;
    default:
      return styles.cellTextAvailable;
  }
}

function LegendDot({ color, border, label }: { color: string; border?: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }, border && { borderWidth: 1, borderColor: border }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.background },
  loadingScreen: { justifyContent: 'center', alignItems: 'center' },
  appBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: AppColors.forestGreen,
    paddingTop: 54,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 3,
    borderBottomColor: AppColors.gold,
  },
  appBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logo: { width: 38, height: 38, borderRadius: 6 },
  appBarTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  appBarSubtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 11, letterSpacing: 1.2 },
  appBarOwnerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legacyButton: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  legacyButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },

  venueCard: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: '#fff',
    margin: 16,
    marginBottom: 8,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
    alignItems: 'center',
  },
  venuePhoto: { width: 56, height: 56, borderRadius: 10 },
  venueName: { fontSize: 16, fontWeight: 'bold', color: '#222' },
  venueLocation: { fontSize: 12, color: '#777', marginTop: 2 },
  venueFrom: { fontSize: 13, fontWeight: '700', color: AppColors.forestGreen, marginTop: 4 },

  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
  },
  dateNavSteppers: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateNavArrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dateNavArrowDisabled: { opacity: 0.4 },
  dateNavArrowText: { fontSize: 18, fontWeight: 'bold', color: AppColors.forestGreen },
  calendarButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  calendarButtonText: { fontSize: 16 },
  dateNavLabel: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  dateNavLabelText: { fontSize: 15, fontWeight: '700', color: '#222' },

  dateChip: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 58,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  dateChipActive: { backgroundColor: AppColors.forestGreen, borderColor: AppColors.forestGreen },
  dateChipWeekday: { color: '#888', fontSize: 11, fontWeight: '600' },
  dateChipDay: { color: '#222', fontSize: 18, fontWeight: 'bold', marginVertical: 2 },
  dateChipTextActive: { color: '#fff' },

  rateBar: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 14,
  },
  rateChip: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    padding: 10,
  },
  rateChipLabel: { fontSize: 11, fontWeight: '700', color: AppColors.forestGreen },
  rateChipValue: { fontSize: 13, fontWeight: 'bold', color: '#222', marginTop: 2 },
  rateChipHours: { fontSize: 10.5, color: '#888', marginTop: 2 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: AppColors.forestGreen,
    paddingHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  gridWrap: { marginHorizontal: 16, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#eee', padding: 10 },
  gridHeaderRow: { flexDirection: 'row', marginBottom: 4 },
  timeColSpacer: { width: 60 },
  courtHeaderCell: { flex: 1, alignItems: 'center', paddingVertical: 4, borderRadius: 8 },
  courtHeaderCellActive: { backgroundColor: 'rgba(254,183,3,0.18)' },
  courtHeaderName: { fontSize: 11.5, fontWeight: '700', color: '#222', textAlign: 'center' },
  courtHeaderType: { fontSize: 9, color: '#999', marginTop: 1 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#999', marginTop: 10, marginBottom: 4, letterSpacing: 0.5 },
  gridRow: { flexDirection: 'row', alignItems: 'stretch', marginBottom: 4 },
  timeCol: { width: 60, justifyContent: 'center' },
  timeColText: { fontSize: 10.5, color: '#555', fontWeight: '600' },
  cell: {
    flex: 1,
    marginHorizontal: 2,
    height: 40,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cellAvailable: { backgroundColor: '#DFF5E3', borderWidth: 1, borderColor: '#8FD9A3' },
  cellTextAvailable: { fontSize: 10, color: '#1E7A3C', fontWeight: '600' },
  cellSelected: { backgroundColor: AppColors.gold },
  cellTextSelected: { fontSize: 13, color: AppColors.forestGreen, fontWeight: 'bold' },
  cellPending: { backgroundColor: '#FCE8A6' },
  cellTextPending: { fontSize: 9, color: '#8A6D00', fontWeight: '600' },
  cellBooked: { backgroundColor: '#D8D8D8' },
  cellTextBooked: { fontSize: 9, color: '#777', fontWeight: '600' },
  cellPast: { backgroundColor: '#F0F0F0' },
  cellTextPast: { fontSize: 10, color: '#ccc' },

  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginHorizontal: 16, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 11, color: '#666' },

  summaryCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginTop: 18,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  summaryTitle: { fontSize: 14, fontWeight: 'bold', color: AppColors.forestGreen },
  summarySlots: { fontSize: 12.5, color: '#666', marginTop: 2, marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '600', color: '#444', marginTop: 10, marginBottom: 8 },
  input: {
    backgroundColor: '#fafafa',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: '#222',
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepperButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: AppColors.forestGreen,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  stepperValue: { fontSize: 16, fontWeight: 'bold', color: '#222', minWidth: 24, textAlign: 'center' },
  stepperInput: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#222',
    minWidth: 48,
    textAlign: 'center',
    borderWidth: 1,
    borderColor: AppColors.forestGreen,
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  totalLabel: { color: '#666', fontSize: 13 },
  totalValue: { color: AppColors.forestGreen, fontSize: 18, fontWeight: 'bold' },
  reserveButton: {
    backgroundColor: AppColors.crimsonRed,
    marginTop: 14,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  reserveButtonDisabled: { opacity: 0.7 },
  reserveButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },

  upcomingButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  upcomingButtonText: { fontSize: 14, fontWeight: '700', color: AppColors.forestGreen },
  upcomingButtonChevron: { fontSize: 20, color: AppColors.forestGreen, fontWeight: 'bold' },

  infoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#eee',
  },
  infoHeading: { fontSize: 13, fontWeight: '700', color: '#222' },
  amenityWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  amenityTag: {
    backgroundColor: AppColors.background,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  amenityTagText: { fontSize: 11.5, color: '#444', fontWeight: '600' },
  infoLine: { fontSize: 12.5, color: '#555', marginTop: 6 },
});
