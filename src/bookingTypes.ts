// Types and helpers for the Court Reservation module.
// Content model (courts x time-slot availability grid, time-of-day rate
// tiers, morning/afternoon/evening grouping, amenities/contact info) is
// modeled after Courtara's venue booking page, restyled in Mt Pickle
// Park's own brand colors rather than copied visually.

export type CourtType = 'INDOOR' | 'OUTDOOR';

export interface Court {
  name: string;
  type: CourtType;
}

export const COURTS: Court[] = [
  { name: 'Court 1', type: 'INDOOR' },
  { name: 'Court 2', type: 'INDOOR' },
  { name: 'Court 3', type: 'OUTDOOR' },
];

// Time-of-day rate tiers. Flat rate per tier — same price for indoor and
// outdoor courts. `startHour`/`endHour` also define which hours are
// actually bookable (see TIME_SLOTS below): DAY/AFTERNOON and NIGHT are
// now back-to-back (7 AM-5 PM, then 5 PM-11 PM) with no gap between them.
export interface RateTier {
  label: string;
  startHour: number; // inclusive, 24h
  endHour: number; // exclusive, 24h
  indoorRate: number;
  outdoorRate: number;
}

export const RATE_TIERS: RateTier[] = [
  { label: 'DAY/AFTERNOON', startHour: 7, endHour: 17, indoorRate: 200, outdoorRate: 200 },
  { label: 'NIGHT', startHour: 17, endHour: 23, indoorRate: 250, outdoorRate: 250 },
];

export function rateTierForHour(hour: number): RateTier {
  return RATE_TIERS.find((t) => hour >= t.startHour && hour < t.endHour) ?? RATE_TIERS[0];
}

export function rateForSlot(court: Court, hour: number): number {
  const tier = rateTierForHour(hour);
  return court.type === 'INDOOR' ? tier.indoorRate : tier.outdoorRate;
}

export function lowestRate(): number {
  return Math.min(...RATE_TIERS.map((t) => t.outdoorRate));
}

export type SlotSection = 'Morning' | 'Afternoon' | 'Evening';

export interface TimeSlot {
  label: string; // "6-7 AM"
  hour: number; // 24h start hour
  section: SlotSection;
}

// Groups slots for the availability grid's section headers. With the
// current bookable hours (7 AM-5 PM, 5 PM-11 PM, no gap) this sorts out
// to: Morning = 7-11 AM, Afternoon = 12-4 PM (last slot ends 5 PM),
// Evening = 5-10 PM (last slot ends 11 PM) — matching the
// DAY/AFTERNOON vs NIGHT rate windows.
function sectionForHour(hour: number): SlotSection {
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
}

function formatSlotLabel(hour24: number): string {
  const startH = ((hour24 + 11) % 12) + 1;
  const endHour24 = hour24 + 1;
  const endH = ((endHour24 + 11) % 12) + 1;
  const endAmpm = endHour24 >= 12 && endHour24 < 24 ? 'PM' : 'AM';
  // Only show one AM/PM label at the end (e.g. "6-7 AM") unless the slot
  // crosses the noon boundary (e.g. "11 AM-12 PM").
  const startAmpm = hour24 >= 12 && hour24 < 24 ? 'PM' : 'AM';
  if (startAmpm === endAmpm) {
    return `${startH}-${endH} ${endAmpm}`;
  }
  return `${startH} ${startAmpm}-${endH} ${endAmpm}`;
}

// Bookable hours: 7 AM-5 PM (DAY/AFTERNOON) straight through to 11 PM
// (NIGHT) — no gap. The old version stopped DAY at 4 PM and started NIGHT
// at 5 PM, which silently dropped the 4-5 PM hour from ever being
// bookable at all; that's fixed by including hour 16 (4-5 PM) below, and
// the DAY/AFTERNOON tier above now covers it (endHour: 17). Same window
// every day — this list isn't date-specific, so it applies identically to
// every date the booking screen shows.
const BOOKABLE_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

export const TIME_SLOTS: TimeSlot[] = BOOKABLE_HOURS.map((hour) => ({
  label: formatSlotLabel(hour),
  hour,
  section: sectionForHour(hour),
}));

export const SLOT_SECTIONS: SlotSection[] = ['Morning', 'Afternoon', 'Evening'];

export interface Reservation {
  id: string;
  customerName: string;
  court: string; // Court.name
  // ISO date string, e.g. "2026-08-25" — always local calendar date, not a
  // full timestamp, so comparisons are simple string equality.
  date: string;
  // One or more hour values from TIME_SLOTS, e.g. [6, 7].
  hours: number[];
  players: number;
  notes: string;
  isPaid: boolean;
  createdAt: number;
  // auth.uid() of whoever made the booking — the owner, or the player
  // who booked it themselves. Used to let a player cancel their own
  // reservation while leaving everyone else's alone (also enforced
  // server-side by RLS, not just by what the screen shows).
  createdBy: string;
}

export function courtByName(name: string): Court {
  return COURTS.find((c) => c.name === name) ?? COURTS[0];
}

export function reservationTotal(reservation: Reservation): number {
  const court = courtByName(reservation.court);
  return reservation.hours.reduce((sum, h) => sum + rateForSlot(court, h), 0);
}

export function slotLabelsForHours(hours: number[]): string[] {
  return hours
    .slice()
    .sort((a, b) => a - b)
    .map((h) => TIME_SLOTS.find((s) => s.hour === h)?.label ?? `${h}:00`);
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function toIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function addDays(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + delta);
  return toIsoDate(date);
}

// Next `count` days starting today, as Date objects — used for the quick
// date-jump strip (no date-picker library needed).
export function nextDays(count: number): Date[] {
  const out: Date[] = [];
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    out.push(d);
  }
  return out;
}

export function formatDateChip(date: Date): { weekday: string; day: string; month: string } {
  const weekdays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  return {
    weekday: weekdays[date.getDay()],
    day: date.getDate().toString(),
    month: months[date.getMonth()],
  };
}

export function formatFriendlyDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${weekdays[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
}

export function isPastSlot(dateIso: string, hour: number): boolean {
  const now = new Date();
  if (dateIso !== todayIso()) return dateIso < todayIso();
  // A slot like `hour = 10` covers the 10:00-10:59 window, so it should
  // stay bookable for the entire hour it represents, and only become past
  // once the clock actually moves into the *next* hour. Using `<=` here
  // (the old bug) flipped the slot to "past" the instant the clock hit its
  // start hour — so the 10-11 AM slot vanished right at 10:00 AM, an hour
  // before it should have, while 11-12 PM incorrectly showed as the
  // earliest bookable slot.
  return hour < now.getHours();
}
