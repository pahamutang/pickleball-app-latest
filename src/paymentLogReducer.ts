import { Payment, PaymentStatus, PaymentLineItem } from './payment';
import { generateId } from './types';

export type NewPayment = {
  description: string;
  amount: number;
  method: string;
  status: PaymentStatus;
  items?: PaymentLineItem[];
};

export type ItemPaidUpdate = {
  // Stable key for this item within the player's row — matches the
  // PaymentLineItem.description used for it, so marking/un-marking/renaming
  // the same item again finds and updates the same line instead of
  // duplicating it. For court fee this is always 'Court fee'; for an order
  // it's '<name> x<quantity>', same as what's shown in the breakdown.
  key: string;
  description: string; // full "PlayerName — thing" description for the row
  amount: number;
  method: string;
};

// A real UUID — matches the `uuid` primary key column in Supabase's
// `payments` table, so a row generated on-device inserts cleanly.
function makeId(): string {
  return generateId();
}

// Both look like "PlayerName — thing". Split off the player-name prefix so
// a freshly-derived description can be re-attached to it.
export function splitDescription(desc: string): [string, string] {
  const idx = desc.indexOf('—');
  if (idx === -1) return [desc, ''];
  return [desc.slice(0, idx).trim(), desc.slice(idx + 1).trim()];
}

// Rebuilds the row's description FROM SCRATCH based on what's currently in
// its items list — never by gluing old and new text together. This is
// deliberate: a row's description must describe what's on it RIGHT NOW.
// If court fee was owed earlier but has since been settled and dropped
// from items[], "Court fee" must stop appearing in the description too —
// otherwise stale text like "Court fee & orders" lingers forever even
// after the court fee was paid off separately.
export function describeItems(playerName: string, items: PaymentLineItem[]): string {
  if (items.length === 0) return `${playerName} — Payment`;
  const hasCourtFee = items.some((li) => li.description === 'Court fee');
  const hasOrders = items.some((li) => li.description !== 'Court fee');

  if (hasCourtFee && hasOrders) return `${playerName} — Court fee & orders`;
  if (hasCourtFee) return `${playerName} — Court fee`;
  if (hasOrders) return `${playerName} — Orders`;
  return `${playerName} — Payment`;
}

export function applyAddPayment(
  payments: Payment[],
  payment: NewPayment,
  now: string = new Date().toISOString()
): Payment[] {
  const entry: Payment = { ...payment, id: makeId(), date: now };
  return [entry, ...payments];
}

// Cash-register style ("Collect Payment" calculator): updates this
// player's current row (paid, pending, or failed) with the freshly
// computed totals, instead of stacking a new row every time. Only starts a
// new row if the player doesn't currently have one.
//
// IMPORTANT: this MERGES `payment.items` into whatever is already logged
// for the player, rather than replacing the row outright. Without this, a
// court fee marked paid via the PAID chip (which logs its own item) would
// get silently erased the next time the cash register touches the row —
// e.g. collecting the remaining orders and coming up short would overwrite
// the row with only the orders' items, losing the court-fee line and
// making the row's total look wrong relative to what was really collected.
//
// The row's `amount`, though, must NOT be recomputed by summing the merged
// items' prices. `items[].amount` is each item's FULL price (used for the
// history breakdown, e.g. "Coke x2 — ₱40") — not what was actually handed
// over for it. For a short/partial payment those two numbers differ (that's
// the whole point of a partial payment), so summing items silently replaced
// "cash actually collected" with "total still owed," which is what made a
// ₱60 partial collection on a ₱140 tab log as ₱140. Instead: keep whatever
// was already collected for items this call doesn't touch, and add exactly
// what `payment.amount` says was collected this time.
export function applySetPlayerPayment(
  payments: Payment[],
  playerId: string,
  payment: NewPayment,
  now: string = new Date().toISOString()
): Payment[] {
  const idx = payments.findIndex((p) => p.playerId === playerId);
  const existing = idx === -1 ? null : payments[idx];
  const existingItems = existing?.items ?? [];
  const newItems = payment.items ?? [];

  // Merge by item key (line description) so re-logging the same item just
  // updates it in place, and items logged by a different path (the PAID
  // chip) are preserved instead of dropped.
  const mergedMap = new Map(existingItems.map((li) => [li.description, li]));
  for (const li of newItems) mergedMap.set(li.description, li);
  const mergedItems = Array.from(mergedMap.values());

  // Cash already collected for items this call isn't touching (e.g. a
  // court fee settled earlier via the PAID chip) + whatever was actually
  // received in THIS call. Never derived from the items' listed prices.
  const newKeys = new Set(newItems.map((li) => li.description));
  const untouchedExistingAmount = existingItems
    .filter((li) => !newKeys.has(li.description))
    .reduce((sum, li) => sum + li.amount, 0);
  const mergedAmount = untouchedExistingAmount + payment.amount;

  const playerName = splitDescription(existing?.description ?? payment.description)[0];
  const description = describeItems(playerName, mergedItems);

  if (!existing) {
    const entry: Payment = {
      ...payment,
      description,
      items: mergedItems,
      amount: mergedAmount,
      playerId,
      id: makeId(),
      date: now,
    };
    return [entry, ...payments];
  }

  const updated: Payment = {
    ...existing,
    description,
    amount: mergedAmount,
    method: existing.method === payment.method ? existing.method : 'Mixed',
    status: payment.status,
    items: mergedItems,
    date: now,
  };
  const rest = payments.filter((_, i) => i !== idx);
  return [updated, ...rest]; // bump to top as the most recently touched row
}

// Single-item toggle style (tapping the PAID chip on court fee or one
// order). Idempotent in both directions: marking an item that's already
// logged is a no-op, and un-marking it removes exactly that item's line
// and amount from the row — so flipping a chip on/off/on again never
// inflates the total or duplicates the item breakdown.
export function applySetPlayerItemPaid(
  payments: Payment[],
  playerId: string,
  item: ItemPaidUpdate,
  paid: boolean,
  // The player's amountDue() AFTER this toggle is applied. This is what
  // decides the row's status — NOT the fact that "an item just got marked
  // paid." Marking one order paid while the court fee (or another order)
  // is still owed must NOT flip the whole row to 'paid'; it should read
  // 'pending' until remainingDue actually reaches 0. This is the fix for
  // Home showing "Partially Paid" while History showed "PAID".
  remainingDue: number,
  now: string = new Date().toISOString()
): Payment[] {
  const idx = payments.findIndex((p) => p.playerId === playerId);
  const status: PaymentStatus = remainingDue <= 0 ? 'paid' : 'pending';

  if (paid) {
    if (idx === -1) {
      const entry: Payment = {
        id: makeId(),
        date: now,
        playerId,
        description: item.description,
        amount: item.amount,
        method: item.method,
        status,
        items: [{ description: item.key, amount: item.amount }],
      };
      return [entry, ...payments];
    }

    const existing = payments[idx];
    const existingItems = existing.items ?? [];
    const matchIdx = existingItems.findIndex((li) => li.description === item.key);
    const playerName = splitDescription(existing.description)[0];

    if (matchIdx !== -1) {
      // The item is already listed on this row — but that doesn't
      // necessarily mean it was ever actually settled. The cash register
      // (applySetPlayerPayment) can log an item as "still owed" at its
      // full price during a pending/failed attempt. If we bailed out here
      // unconditionally, checking that same item's PAID chip later would
      // never update the row's status — which is exactly what left rows
      // stuck on "Pending" forever even after everything got paid by hand.
      // So: never duplicate the line or inflate the total, but DO let the
      // status catch up with the player's real remaining-due state.
      if (existing.status === status && existingItems[matchIdx].amount === item.amount) {
        return payments;
      }
      const updatedItems = existingItems.map((li, i) =>
        i === matchIdx ? { description: item.key, amount: item.amount } : li
      );
      const updated: Payment = {
        ...existing,
        description: describeItems(playerName, updatedItems),
        amount: updatedItems.reduce((sum, li) => sum + li.amount, 0),
        items: updatedItems,
        status,
        date: now,
      };
      const rest = payments.filter((_, i) => i !== idx);
      return [updated, ...rest];
    }

    const newItems = [...existingItems, { description: item.key, amount: item.amount }];
    const updated: Payment = {
      ...existing,
      amount: existing.amount + item.amount,
      method: existing.method === item.method ? existing.method : 'Mixed',
      status,
      description: describeItems(playerName, newItems),
      items: newItems,
      date: now,
    };
    const rest = payments.filter((_, i) => i !== idx);
    return [updated, ...rest];
  }

  // Un-marking: remove exactly this item's line/amount from the row, if
  // it's there. If nothing's left logged for the player afterward, drop
  // the row entirely instead of leaving an empty/zero entry.
  if (idx === -1) return payments;
  const existing = payments[idx];
  const existingItems = existing.items ?? [];
  if (!existingItems.some((li) => li.description === item.key)) return payments;

  const remainingItems = existingItems.filter((li) => li.description !== item.key);
  const remainingAmount = Math.max(0, existing.amount - item.amount);

  if (remainingItems.length === 0 || remainingAmount <= 0) {
    return payments.filter((_, i) => i !== idx);
  }

  const playerName = splitDescription(existing.description)[0];
  const updated: Payment = {
    ...existing,
    amount: remainingAmount,
    items: remainingItems,
    description: describeItems(playerName, remainingItems),
    status, // un-marking always increases remainingDue above 0, so this settles to 'pending'
    date: now,
  };
  const rest = payments.filter((_, i) => i !== idx);
  return [updated, ...rest];
}

// Renames/updates a single already-logged line item in place (used when an
// order that's already been marked paid gets its name/price edited via the
// pencil icon), so the log doesn't go stale relative to the actual order.
// No-op if the player has no row, or the row doesn't contain that item.
export function applyRenamePlayerItem(
  payments: Payment[],
  playerId: string,
  oldKey: string,
  updated: ItemPaidUpdate,
  now: string = new Date().toISOString()
): Payment[] {
  const idx = payments.findIndex((p) => p.playerId === playerId);
  if (idx === -1) return payments;

  const existing = payments[idx];
  const existingItems = existing.items ?? [];
  const itemIdx = existingItems.findIndex((li) => li.description === oldKey);
  if (itemIdx === -1) return payments;

  const oldAmount = existingItems[itemIdx].amount;
  const newItems = existingItems.map((li, i) =>
    i === itemIdx ? { description: updated.key, amount: updated.amount } : li
  );
  const newTotal = existing.amount - oldAmount + updated.amount;

  const entry: Payment = { ...existing, amount: newTotal, items: newItems, date: now };
  const rest = payments.filter((_, i) => i !== idx);
  return [entry, ...rest];
}
