import { Payment } from '../payment';
import {
  applySetPlayerPayment,
  applySetPlayerItemPaid,
  applyRenamePlayerItem,
  describeItems,
} from '../paymentLogReducer';

const NOW = '2026-07-04T12:00:00.000Z';
const NOW2 = '2026-07-04T12:05:00.000Z';

describe('applySetPlayerPayment (cash-register flow)', () => {
  it('creates a new row when the player has none yet', () => {
    const result = applySetPlayerPayment(
      [],
      'p1',
      { description: 'Alice — Court fee', amount: 100, method: 'Cash', status: 'paid' },
      NOW
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ playerId: 'p1', amount: 100, status: 'paid' });
  });

  it('replaces (not stacks) the existing row for the same player', () => {
    const first = applySetPlayerPayment(
      [],
      'p1',
      { description: 'Alice — Court fee', amount: 100, method: 'Cash', status: 'pending' },
      NOW
    );
    const second = applySetPlayerPayment(
      first,
      'p1',
      { description: 'Alice — Court fee', amount: 100, method: 'Cash', status: 'paid' },
      NOW2
    );
    // Still exactly one row for this player, not two.
    expect(second).toHaveLength(1);
    expect(second[0].status).toBe('paid');
    expect(second[0].date).toBe(NOW2);
  });

  it('does not disturb other players rows', () => {
    const withP1 = applySetPlayerPayment(
      [],
      'p1',
      { description: 'Alice — Court fee', amount: 100, method: 'Cash', status: 'paid' },
      NOW
    );
    const withBoth = applySetPlayerPayment(
      withP1,
      'p2',
      { description: 'Bob — Court fee', amount: 150, method: 'Cash', status: 'pending' },
      NOW2
    );
    expect(withBoth).toHaveLength(2);
    expect(withBoth.find((p) => p.playerId === 'p1')?.status).toBe('paid');
    expect(withBoth.find((p) => p.playerId === 'p2')?.status).toBe('pending');
  });

  it('a short cash collection logs the row as pending, not paid', () => {
    // Regression test for the bug where a partial payment logged via the
    // "Collect Payment" calculator wasn't actually persisted as pending.
    const result = applySetPlayerPayment(
      [],
      'p1',
      { description: 'Alice — Court fee', amount: 60, method: 'Cash', status: 'pending' },
      NOW
    );
    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('pending');
    expect(result[0].amount).toBe(60);
  });

  it('a partial cash-register collection records the actual cash received, not the full tab', () => {
    // Regression test: on a ₱140 tab (₱100 court fee + ₱40 order), handing
    // over only ₱60 must log ₱60 collected — not ₱140 (the item list's
    // full price total, which is what a broken merge previously logged).
    const result = applySetPlayerPayment(
      [],
      'p1',
      {
        description: 'Alice — Court fee & Coke x1',
        amount: 60,
        method: 'Cash',
        status: 'pending',
        items: [
          { description: 'Court fee', amount: 100 },
          { description: 'Coke x1', amount: 40 },
        ],
      },
      NOW
    );
    expect(result[0].amount).toBe(60);
    // The breakdown still shows the full per-item prices for reference.
    expect(result[0].items).toEqual([
      { description: 'Court fee', amount: 100 },
      { description: 'Coke x1', amount: 40 },
    ]);
  });

  it('preserves a court fee already settled via the PAID chip when the cash register later collects the rest', () => {
    // This is exactly the scenario the merge logic exists for: court fee
    // ₱100 was already paid via the chip; the cash register now collects
    // ₱20 of the remaining ₱40 order and comes up short. The row must
    // show ₱120 total collected (₱100 + ₱20) — not ₱140 (full tab) and
    // not ₱20 (losing the court fee that was already paid).
    const afterChip = applySetPlayerItemPaid(
      [],
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      0,
      NOW
    );
    const afterCashRegister = applySetPlayerPayment(
      afterChip,
      'p1',
      {
        description: 'Alice — Coke x1',
        amount: 20, // only ₱20 of the ₱40 order handed over
        method: 'Cash',
        status: 'pending',
        items: [{ description: 'Coke x1', amount: 40 }],
      },
      NOW2
    );
    expect(afterCashRegister).toHaveLength(1);
    expect(afterCashRegister[0].amount).toBe(120);
    expect(afterCashRegister[0].status).toBe('pending');
  });
});

describe('applySetPlayerItemPaid (chip toggle flow)', () => {
  it('creates a row on first mark-paid', () => {
    const result = applySetPlayerItemPaid(
      [],
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      0, // fully settled after this toggle
      NOW
    );
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100);
    expect(result[0].status).toBe('paid');
    expect(result[0].items).toEqual([{ description: 'Court fee', amount: 100 }]);
  });

  it('is idempotent — marking the same item paid twice does not double the amount', () => {
    let payments: Payment[] = [];
    const item = { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' };
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, 0, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, 0, NOW2); // repeat tap
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(100); // NOT 200
    expect(payments[0].items).toHaveLength(1); // NOT duplicated
  });

  it('adds a second distinct item onto the same row instead of a new row', () => {
    let payments: Payment[] = [];
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      40, // Coke still owed at this point
      NOW
    );
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Coke x2', description: 'Alice — Coke x2', amount: 40, method: 'Cash' },
      true,
      0, // now fully settled
      NOW2
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(140);
    expect(payments[0].items).toHaveLength(2);
    expect(payments[0].status).toBe('paid');
  });

  it('marking one item paid while another is still owed keeps the row pending, not paid', () => {
    // Regression test: Home showing "Partially Paid" while History showed
    // "PAID" — the row's status must follow remainingDue, not just the
    // fact that an item was marked paid.
    const payments = applySetPlayerItemPaid(
      [],
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      40, // Coke (₱40) still owed
      NOW
    );
    expect(payments[0].status).toBe('pending');
  });

  it('un-marking removes exactly that item, leaving the other intact', () => {
    let payments: Payment[] = [];
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      40,
      NOW
    );
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Coke x2', description: 'Alice — Coke x2', amount: 40, method: 'Cash' },
      true,
      0,
      NOW
    );
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      false,
      100, // court fee owed again
      NOW2
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(40);
    expect(payments[0].items).toEqual([{ description: 'Coke x2', amount: 40 }]);
  });

  it('un-marking the last remaining item drops the row entirely', () => {
    let payments: Payment[] = [];
    const item = { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' };
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, 0, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, false, 100, NOW2);
    expect(payments).toHaveLength(0);
  });

  it('un-marking something that was never logged is a no-op', () => {
    const payments = applySetPlayerItemPaid(
      [],
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      false,
      100,
      NOW
    );
    expect(payments).toHaveLength(0);
  });

  it('flipping on/off/on again never inflates the total (regression for the original stacking bug)', () => {
    let payments: Payment[] = [];
    const item = { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' };
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, 0, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, false, 100, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, 0, NOW2);
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(100);
    expect(payments[0].items).toHaveLength(1);
  });
});

describe('applyRenamePlayerItem (editing an already-paid order)', () => {
  it('updates the amount and key when the order is renamed/re-priced', () => {
    let payments: Payment[] = [];
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Iced Tea x2', description: 'Alice — Iced Tea x2', amount: 80, method: 'Cash' },
      true,
      0,
      NOW
    );
    payments = applyRenamePlayerItem(
      payments,
      'p1',
      'Iced Tea x2',
      { key: 'Iced Tea x3', description: 'Alice — Iced Tea x3', amount: 120, method: 'Cash' },
      NOW2
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(120);
    expect(payments[0].items).toEqual([{ description: 'Iced Tea x3', amount: 120 }]);
  });

  it('is a no-op if the player has no row', () => {
    const payments = applyRenamePlayerItem(
      [],
      'p1',
      'Iced Tea x2',
      { key: 'Iced Tea x3', description: 'Alice — Iced Tea x3', amount: 120, method: 'Cash' },
      NOW
    );
    expect(payments).toHaveLength(0);
  });

  it('is a no-op if the item is not in the row', () => {
    let payments: Payment[] = [];
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      0,
      NOW
    );
    const unchanged = applyRenamePlayerItem(
      payments,
      'p1',
      'Iced Tea x2',
      { key: 'Iced Tea x3', description: 'Alice — Iced Tea x3', amount: 120, method: 'Cash' },
      NOW2
    );
    expect(unchanged).toEqual(payments);
  });
});

describe('describeItems (row description derived from current items)', () => {
  it('describes court fee only', () => {
    expect(describeItems('Alice', [{ description: 'Court fee', amount: 100 }])).toBe(
      'Alice — Court fee'
    );
  });

  it('describes orders only', () => {
    expect(describeItems('Alice', [{ description: 'Coke x2', amount: 40 }])).toBe(
      'Alice — Orders'
    );
  });

  it('describes court fee and orders together', () => {
    expect(
      describeItems('Alice', [
        { description: 'Court fee', amount: 100 },
        { description: 'Coke x2', amount: 40 },
      ])
    ).toBe('Alice — Court fee & orders');
  });

  it('falls back to a generic label when there are no items', () => {
    expect(describeItems('Alice', [])).toBe('Alice — Payment');
  });
});
