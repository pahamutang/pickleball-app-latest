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

// True only if the court fee AND every single order is paid.
export function isFullyPaid(player: Player): boolean {
  return player.courtFeePaid && player.orders.every((o) => o.isPaid);
}

// True if nothing at all has been paid yet.
export function isFullyUnpaid(player: Player): boolean {
  return !player.courtFeePaid && player.orders.every((o) => !o.isPaid);
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
