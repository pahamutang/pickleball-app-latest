import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Payment } from '../payment';
import {
  NewPayment,
  ItemPaidUpdate,
  applyAddPayment,
  applySetPlayerPayment,
  applySetPlayerItemPaid,
  applyRenamePlayerItem,
} from '../paymentLogReducer';

const STORAGE_KEY = 'mt_pickle_payment_log';
const RESET_ANCHOR_KEY = 'mt_pickle_payment_log_reset_at';

// How often the log auto-clears itself.
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

// While the app stays open, check periodically whether the 24h window has
// elapsed (in case someone leaves the app running across the boundary
// instead of closing/reopening it).
const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

interface PaymentLogContextValue {
  payments: Payment[];
  // Legacy, standalone entry not tied to a player (e.g. a misc log line).
  // Nothing in the app currently calls this — kept around in case another
  // screen needs to log something that isn't per-player — but if you don't
  // have a use for it, it's safe to delete along with this comment.
  addPayment: (payment: NewPayment) => void;
  // Cash-register style ("Collect Payment" calculator): REPLACES whatever
  // is currently logged for this player — paid, pending, or failed — with
  // the freshly computed totals, rather than stacking a new row every time
  // you touch their payment. The row only gets a date bump and moves back
  // to the top of the list; it keeps its identity (and stays editable)
  // until it's explicitly removed.
  setPlayerPayment: (playerId: string, payment: NewPayment) => void;
  // Single-item toggle style (tapping the PAID chip on court fee or one
  // order). Idempotent in both directions: marking an item paid that's
  // already logged is a no-op (no duplicate line/amount), and un-marking
  // it actually removes that item's line and amount from the row — so
  // toggling something on/off/on again never inflates the total or the
  // item breakdown.
  setPlayerItemPaid: (playerId: string, item: ItemPaidUpdate, paid: boolean, remainingDue: number) => void;
  // Renames/re-prices a single already-logged item in place — used when an
  // order that's already been marked paid gets edited (pencil icon), so
  // the log doesn't go stale relative to the actual order.
  renamePlayerItem: (playerId: string, oldKey: string, updated: ItemPaidUpdate) => void;
  // The explicit ✕ in Payment History. This is the ONLY way a player's
  // current row goes away — after this, their next payment starts a brand
  // new row again.
  removePayment: (id: string) => void;
  clearHistory: () => void;
  loading: boolean;
}

const PaymentLogContext = createContext<PaymentLogContextValue | undefined>(undefined);

export function PaymentLogProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  // When the current 24h window started. Read from storage on load; falls
  // back to "now" the very first time the app ever runs.
  const resetAnchorRef = useRef<number>(Date.now());

  const persistPayments = useCallback((next: Payment[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch((e) =>
      console.warn('Failed to save payment history', e)
    );
  }, []);

  const persistAnchor = useCallback((anchor: number) => {
    resetAnchorRef.current = anchor;
    AsyncStorage.setItem(RESET_ANCHOR_KEY, String(anchor)).catch((e) =>
      console.warn('Failed to save payment log reset anchor', e)
    );
  }, []);

  // Wipes the log and starts a fresh 24h window from right now.
  const resetNow = useCallback(() => {
    setPayments([]);
    persistPayments([]);
    persistAnchor(Date.now());
  }, [persistPayments, persistAnchor]);

  // Load saved history + reset anchor on app start, and auto-clear
  // immediately if 24h have already passed since the last reset (e.g. the
  // app was closed overnight).
  useEffect(() => {
    (async () => {
      try {
        const [rawPayments, rawAnchor] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEY),
          AsyncStorage.getItem(RESET_ANCHOR_KEY),
        ]);

        const anchor = rawAnchor ? parseInt(rawAnchor, 10) : Date.now();
        const elapsed = Date.now() - anchor;

        if (elapsed >= RESET_INTERVAL_MS) {
          // Window expired while the app was closed — start clean.
          setPayments([]);
          persistAnchor(Date.now());
          await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
        } else {
          resetAnchorRef.current = anchor;
          if (!rawAnchor) await AsyncStorage.setItem(RESET_ANCHOR_KEY, String(anchor));
          if (rawPayments) setPayments(JSON.parse(rawPayments));
        }
      } catch (e) {
        console.warn('Failed to load payment history', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [persistAnchor]);

  // Persist on every change (after initial load).
  useEffect(() => {
    if (loading) return;
    persistPayments(payments);
  }, [payments, loading, persistPayments]);

  // While the app is open, poll for the 24h window elapsing so the log
  // clears itself without needing an app restart.
  useEffect(() => {
    if (loading) return;
    const interval = setInterval(() => {
      const elapsed = Date.now() - resetAnchorRef.current;
      if (elapsed >= RESET_INTERVAL_MS) {
        resetNow();
      }
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loading, resetNow]);

  const addPayment = useCallback((payment: NewPayment) => {
    setPayments((prev) => applyAddPayment(prev, payment));
  }, []);

  const setPlayerPayment = useCallback((playerId: string, payment: NewPayment) => {
    setPayments((prev) => applySetPlayerPayment(prev, playerId, payment));
  }, []);

  const setPlayerItemPaid = useCallback(
    (playerId: string, item: ItemPaidUpdate, paid: boolean, remainingDue: number) => {
      setPayments((prev) => applySetPlayerItemPaid(prev, playerId, item, paid, remainingDue));
    },
    []
  );

  const renamePlayerItem = useCallback((playerId: string, oldKey: string, updated: ItemPaidUpdate) => {
    setPayments((prev) => applyRenamePlayerItem(prev, playerId, oldKey, updated));
  }, []);

  // The ✕ in Payment History. This is the only thing that frees a player
  // up to get a brand new row on their next payment.
  const removePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  // Manual clear (e.g. a "Clear History" button) also restarts the 24h
  // window from now, so it doesn't auto-clear again a moment later.
  const clearHistory = useCallback(() => {
    resetNow();
  }, [resetNow]);

  return (
    <PaymentLogContext.Provider
      value={{
        payments,
        addPayment,
        setPlayerPayment,
        setPlayerItemPaid,
        renamePlayerItem,
        removePayment,
        clearHistory,
        loading,
      }}
    >
      {children}
    </PaymentLogContext.Provider>
  );
}

export function usePaymentLog() {
  const ctx = useContext(PaymentLogContext);
  if (!ctx) {
    throw new Error('usePaymentLog must be used within a PaymentLogProvider');
  }
  return ctx;
}
