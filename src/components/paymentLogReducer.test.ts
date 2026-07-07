import { Payment } from '../utils/payment';
import {
  applySetPlayerPayment,
  applySetPlayerItemPaid,
  applyRenamePlayerItem,
  mergeDescriptions,
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
});

describe('applySetPlayerItemPaid (chip toggle flow)', () => {
  it('creates a row on first mark-paid', () => {
    const result = applySetPlayerItemPaid(
      [],
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      NOW
    );
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(100);
    expect(result[0].items).toEqual([{ description: 'Court fee', amount: 100 }]);
  });

  it('is idempotent — marking the same item paid twice does not double the amount', () => {
    let payments: Payment[] = [];
    const item = { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' };
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, NOW2); // repeat tap
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
      NOW
    );
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Coke x2', description: 'Alice — Coke x2', amount: 40, method: 'Cash' },
      true,
      NOW2
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(140);
    expect(payments[0].items).toHaveLength(2);
  });

  it('un-marking removes exactly that item, leaving the other intact', () => {
    let payments: Payment[] = [];
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      true,
      NOW
    );
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Coke x2', description: 'Alice — Coke x2', amount: 40, method: 'Cash' },
      true,
      NOW
    );
    payments = applySetPlayerItemPaid(
      payments,
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      false,
      NOW2
    );
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(40);
    expect(payments[0].items).toEqual([{ description: 'Coke x2', amount: 40 }]);
  });

  it('un-marking the last remaining item drops the row entirely', () => {
    let payments: Payment[] = [];
    const item = { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' };
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, false, NOW2);
    expect(payments).toHaveLength(0);
  });

  it('un-marking something that was never logged is a no-op', () => {
    const payments = applySetPlayerItemPaid(
      [],
      'p1',
      { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' },
      false,
      NOW
    );
    expect(payments).toHaveLength(0);
  });

  it('flipping on/off/on again never inflates the total (regression for the original stacking bug)', () => {
    let payments: Payment[] = [];
    const item = { key: 'Court fee', description: 'Alice — Court fee', amount: 100, method: 'Cash' };
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, false, NOW);
    payments = applySetPlayerItemPaid(payments, 'p1', item, true, NOW2);
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

describe('mergeDescriptions', () => {
  it('combines the "thing" parts without repeating the player name', () => {
    expect(mergeDescriptions('Alice — Court fee', 'Alice — Coke x2')).toBe('Alice — Court fee & Coke x2');
  });

  it('does not duplicate if the addition is already represented', () => {
    expect(mergeDescriptions('Alice — Court fee', 'Alice — Court fee')).toBe('Alice — Court fee');
  });
});
