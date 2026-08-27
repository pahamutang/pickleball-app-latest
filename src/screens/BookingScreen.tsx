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
import { useBooking } from '../context/BookingContext';
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
import PaidChip from '../components/PaidChip';
import VenuePhotoCarousel from '../components/VenuePhotoCarousel';
import VenuePhotoManagerModal from '../components/VenuePhotoManagerModal';
import { useVenuePhotos } from '../context/VenuePhotosContext';
import VenueLocationCard from '../components/VenueLocationCard';
import CancelReservationModal from '../components/CancelReservationModal';
import AlertModal from '../components/AlertModal';
import ReservationConfirmedModal from '../components/ReservationConfirmedModal';

const DATE_STRIP_DAYS = 14;

// Shown until the owner has added any photos of their own via "Edit
// Photos" (see VenuePhotoManagerModal) — bundled with the app so the
// carousel never looks empty on a fresh install.
const DEFAULT_VENUE_PHOTOS = [
  require('../../assets/venue/court_1.jpg'),
  require('../../assets/venue/court_2.jpg'),
  require('../../assets/venue/court_3.jpg'),
  require('../../assets/venue/court_4.jpg'),
  require('../../assets/venue/court_5.jpg'),
];

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
  const { reservations, loading, addReservation, cancelReservation, setPaid } = useBooking();
  const { session, profile } = useAuth();
  const isOwner = profile?.role === 'owner';
  const { photos: venuePhotos } = useVenuePhotos();
  const carouselPhotos = venuePhotos.length
    ? venuePhotos.map((p) => ({ uri: p.url }))
    : DEFAULT_VENUE_PHOTOS;
  const [showPhotoManager, setShowPhotoManager] = useState(false);
  const myName = profile?.display_name?.trim() || '';

  const dates = useMemo(() => nextDays(DATE_STRIP_DAYS), []);
  const today = todayIso();

  const [selectedDate, setSelectedDate] = useState<string>(today);
  const [showDateStrip, setShowDateStrip] = useState(false);
  // Selected hours, keyed by court name — e.g. { 'Court 1': [7, 8], 'Court 3': [7] }.
  // A court with no selection is either absent from this map or maps to [].
  // This lets a single booking cover multiple courts at once (e.g. Court 1
  // AND Court 3 for the same time slot), instead of being locked to one
  // court like the old `selectedCourt` + `selectedHours` pair was.
  const [selectedSlots, setSelectedSlots] = useState<Record<string, number[]>>({});
  // Players book under their own account name — locked, not free text —
  // so nobody can reserve a court "as" someone else. Owners keep the
  // free-text field since they're booking on behalf of walk-in customers.
  const [customerName, setCustomerName] = useState(isOwner ? '' : myName);
  const [players, setPlayers] = useState(2);
  const [notes, setNotes] = useState('');
  const [pendingCancel, setPendingCancel] = useState<Reservation | null>(null);

  // Dropping the date resets any in-progress slot selection — a selection
  // made for one date should never silently apply to another.
  useEffect(() => {
    setSelectedSlots({});
  }, [selectedDate]);

  const reservationsForDate = useMemo(
    () => reservations.filter((r) => r.date === selectedDate),
    [reservations, selectedDate]
  );

  const cellStatus = (court: Court, hour: number): CellStatus => {
    if (isPastSlot(selectedDate, hour)) return 'past';
    const match = reservationsForDate.find((r) => r.court === court.name && r.hours.includes(hour));
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
    setNotes('');
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
    // Re-check against the latest reservations right before saving, in case
    // something else got booked in the moments since the slots were picked.
    // Checked per-court, since each court now has its own independent
    // selection of hours.
    const conflict = activeCourtNames.some((courtName) =>
      selectedSlots[courtName].some((h) =>
        reservationsForDate.some((r) => r.court === courtName && r.hours.includes(h))
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
    // reservation to a single court), but they're all created together as
    // one booking action covering every court the player selected.
    const newReservations: Reservation[] = activeCourtNames.map((courtName) => ({
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
    }));

    setSubmitting(true);
    const saved: Reservation[] = [];
    let failure: string | undefined;
    for (const reservation of newReservations) {
      const result = await addReservation(reservation);
      if (!result.ok) {
        failure = result.error;
        break;
      }
      saved.push(reservation);
    }

    if (failure) {
      // Don't leave a half-booked state — if Court 1 saved but Court 2
      // failed, undo Court 1 too, so the player either gets every court
      // they asked for or none of them.
      await Promise.all(saved.map((r) => cancelReservation(r.id)));
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
    setConfirmedReservations(newReservations);
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

  // Owners see the whole park's upcoming bookings (that's their job).
  // Players only see their own — the availability grid above already
  // shows them which slots are taken without exposing every other
  // customer's name and notes in a list.
  const upcoming = useMemo(() => {
    return reservations
      .filter((r) => r.date >= today)
      .filter((r) => isOwner || r.createdBy === session?.user.id)
      .sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return Math.min(...a.hours) - Math.min(...b.hours);
      });
  }, [reservations, today, isOwner, session?.user.id]);

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
        {isOwner && onOpenLegacy && (
          <Pressable
            onPress={onOpenLegacy}
            style={styles.legacyButton}
            accessibilityLabel="Open Payment Tracker (session mode)"
            accessibilityRole="button"
          >
            <Text style={styles.legacyButtonText}>💳 Payment Tracker</Text>
          </Pressable>
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

        {/* Date navigator — prev/next arrows + tap to open the quick-jump strip */}
        <View style={styles.dateNav}>
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
          <LegendDot color="#FCE8A6" label="Pending" />
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
              onChangeText={isOwner ? setCustomerName : undefined}
              editable={isOwner}
              placeholder="e.g. Juan Dela Cruz"
              placeholderTextColor="#999"
              style={[styles.input, !isOwner && styles.inputLocked]}
            />

            <Text style={styles.label}>Players</Text>
            <View style={styles.stepperRow}>
              <Pressable
                onPress={() => setPlayers((p) => Math.max(1, p - 1))}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel="Decrease player count"
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </Pressable>
              <Text style={styles.stepperValue}>{players}</Text>
              <Pressable
                onPress={() => setPlayers((p) => Math.min(8, p + 1))}
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

        {/* Upcoming reservations */}
        <Text style={styles.sectionTitle}>
          {isOwner ? 'Upcoming Reservations' : 'My Reservations'}
        </Text>
        {upcoming.length === 0 ? (
          <Text style={styles.emptyText}>
            {isOwner ? 'No upcoming reservations yet.' : "You haven't booked a court yet."}
          </Text>
        ) : (
          upcoming.map((r) => (
            <View key={r.id} style={styles.reservationCard}>
              <View style={styles.reservationHeader}>
                <Text style={styles.reservationName}>{r.customerName}</Text>
                <PaidChip paid={r.isPaid} onPress={isOwner ? () => togglePaid(r) : undefined} />
              </View>
              <Text style={styles.reservationDetail}>
                {r.court} · {formatFriendlyDate(r.date)}
              </Text>
              <Text style={styles.reservationDetail}>{slotLabelsForHours(r.hours).join(', ')}</Text>
              <Text style={styles.reservationDetail}>
                {r.players} player{r.players === 1 ? '' : 's'}
                {r.notes ? ` · ${r.notes}` : ''}
              </Text>
              <View style={styles.reservationFooter}>
                <Text style={styles.reservationTotal}>{formatCurrency(reservationTotal(r))}</Text>
                {canCancel(r) && (
                  <Pressable onPress={() => deleteReservation(r)} accessibilityRole="button">
                    <Text style={styles.cancelText}>Cancel</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ))
        )}

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
      return 'Pending';
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
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
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
  inputLocked: { backgroundColor: '#f0f0f0', color: '#555' },
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

  emptyText: { color: '#888', fontSize: 13, paddingHorizontal: 16 },
  reservationCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reservationName: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  reservationDetail: { fontSize: 12.5, color: '#666', marginTop: 2 },
  reservationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  reservationTotal: { fontSize: 14, fontWeight: 'bold', color: AppColors.forestGreen },
  cancelText: { color: AppColors.crimsonRed, fontSize: 13, fontWeight: '600' },

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
