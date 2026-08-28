// A single food/drink (or any add-on) ordered by a player.
export interface OrderItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  isPaid: boolean;
}

export function orderTotal(order: OrderItem): number {
  return order.price * order.quantity;
}

// A player in the current pickleball session.
export interface Player {
  id: string;
  name: string;
  courtFee: number;
  courtFeePaid: boolean;
  orders: OrderItem[];
  // Set when this row was created by picking a signed-in app account
  // (rather than typed in as a walk-in name) — see AddPlayerModal. This
  // is what makes court_fee/court_fee_paid changes actually show up on
  // that person's own MyBillScreen; a walk-in row with no account has
  // nowhere to sync to.
  linkedUserId?: string;
}

export type PaymentStatus = 'Fully Paid' | 'Partially Paid' | 'Unpaid';

export function ordersTotal(player: Player): number {
  return player.orders.reduce((sum, o) => sum + orderTotal(o), 0);
}

export function ordersPaidTotal(player: Player): number {
  return player.orders
    .filter((o) => o.isPaid)
    .reduce((sum, o) => sum + orderTotal(o), 0);
}

export function grandTotal(player: Player): number {
  return player.courtFee + ordersTotal(player);
}

export function amountPaid(player: Player): number {
  return (player.courtFeePaid ? player.courtFee : 0) + ordersPaidTotal(player);
}

export function amountDue(player: Player): number {
  return grandTotal(player) - amountPaid(player);
}

// True only if the court fee AND every single order is paid. A ₱0 court
// fee (e.g. a free/comped session) counts as settled on its own — there's
// nothing to collect for it, so nobody ever has a reason to tap its PAID
// chip, and requiring that flag anyway would show "Partially Paid" for a
// player who genuinely owes nothing.
export function isFullyPaid(player: Player): boolean {
  const courtFeeSettled = player.courtFee === 0 || player.courtFeePaid;
  return courtFeeSettled && player.orders.every((o) => o.isPaid);
}

// True if nothing at all has been paid yet. A ₱0 court fee is compatible
// with this too (it's moot — neither paid nor unpaid in any way that
// matters) so it doesn't block "fully unpaid" from being true just
// because its flag happens to read false.
export function isFullyUnpaid(player: Player): boolean {
  const courtFeeUnpaid = player.courtFee === 0 || !player.courtFeePaid;
  return courtFeeUnpaid && player.orders.every((o) => !o.isPaid);
}

export function paymentStatus(player: Player): PaymentStatus {
  if (isFullyPaid(player)) return 'Fully Paid';
  if (isFullyUnpaid(player)) return 'Unpaid';
  return 'Partially Paid';
}

// UUID v4 — matches the `uuid` primary key columns in Supabase, so IDs
// generated on-device can be inserted directly as real row IDs.
export function generateId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
