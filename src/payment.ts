export type PaymentStatus = 'paid' | 'pending' | 'failed';

// A single line within a payment's breakdown, e.g. { description: 'Siomai x2', amount: 70 }.
// Structured (rather than a plain string) so the history screen can show
// the price of each item, not just its name.
export interface PaymentLineItem {
  description: string;
  amount: number;
}

export interface Payment {
  id: string;
  // Which player this payment belongs to. Used so the app can find "this
  // player's current open log entry" and edit it in place instead of
  // stacking a new row every time you touch their payment — a row only
  // becomes eligible for a fresh replacement once it's been explicitly
  // removed (✕ in Payment History).
  playerId?: string;
  description: string;
  amount: number;
  method: string; // e.g. 'Cash', 'GCash'
  status: PaymentStatus;
  date: string; // ISO string
  // Line items that made up this payment (e.g. Court fee, Iced Tea x2),
  // each with its own price, so the history screen can show what was
  // actually paid for and how much each part cost.
  items?: PaymentLineItem[];
}
