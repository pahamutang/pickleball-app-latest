import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  ReactNode,
} from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../services/supabaseClient';
import { Payment } from '../payment';
import {
  NewPayment,
  ItemPaidUpdate,
  applyAddPayment,
  applySetPlayerPayment,
  applySetPlayerItemPaid,
  applyRenamePlayerItem,
} from '../paymentLogReducer';

// Device-local only — just remembers when the 24h auto-clear window
// started. The payments themselves now live in Supabase, shared live
// across the owner's devices; this timer is just a local convenience.
const RESET_ANCHOR_KEY = 'mt_pickle_payment_log_reset_at';
const RESET_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CHECK_INTERVAL_MS = 60 * 1000; // 1 minute

interface PaymentLogContextValue {
  payments: Payment[];
  addPayment: (payment: NewPayment) => void;
  setPlayerPayment: (playerId: string, payment: NewPayment) => void;
  setPlayerItemPaid: (playerId: string, item: ItemPaidUpdate, paid: boolean, remainingDue: number) => void;
  renamePlayerItem: (playerId: string, oldKey: string, updated: ItemPaidUpdate) => void;
  removePayment: (id: string) => void;
  clearHistory: () => void;
  loading: boolean;
}

const PaymentLogContext = createContext<PaymentLogContextValue | undefined>(undefined);

type PaymentRow = {
  id: string;
  player_id: string | null;
  description: string;
  amount: number;
  method: string;
  status: Payment['status'];
  date: string;
  items: Payment['items'];
};

function rowToPayment(row: PaymentRow): Payment {
  return {
    id: row.id,
    playerId: row.player_id ?? undefined,
    description: row.description,
    amount: Number(row.amount),
    method: row.method,
    status: row.status,
    date: row.date,
    items: row.items ?? undefined,
  };
}

export function PaymentLogProvider({ children }: { children: ReactNode }) {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const resetAnchorRef = useRef<number>(Date.now());

  // Last known database state, to diff against so we only push what
  // actually changed (same pattern as PlayersContext).
  const lastSyncedRef = useRef<Payment[]>([]);
  const applyingRemoteRef = useRef(false);

  const fetchAll = useCallback(async () => {
    const { data, error } = await supabase
      .from('payments')
      .select('id, player_id, description, amount, method, status, date, items')
      .order('date', { ascending: false });
    if (error) {
      console.warn('Failed to load payment history', error);
      return;
    }
    const mapped = (data ?? []).map(rowToPayment) as Payment[];
    applyingRemoteRef.current = true;
    lastSyncedRef.current = mapped;
    setPayments(mapped);
  }, []);

  const persistAnchor = useCallback((anchor: number) => {
    resetAnchorRef.current = anchor;
    AsyncStorage.setItem(RESET_ANCHOR_KEY, String(anchor)).catch((e) =>
      console.warn('Failed to save payment log reset anchor', e)
    );
  }, []);

  // Wipes the log in Supabase and starts a fresh 24h window from now.
  const resetNow = useCallback(() => {
    (async () => {
      await supabase.from('payments').delete().not('id', 'is', null);
    })();
    persistAnchor(Date.now());
  }, [persistAnchor]);

  useEffect(() => {
    (async () => {
      try {
        const rawAnchor = await AsyncStorage.getItem(RESET_ANCHOR_KEY);
        const anchor = rawAnchor ? parseInt(rawAnchor, 10) : Date.now();
        const elapsed = Date.now() - anchor;

        if (elapsed >= RESET_INTERVAL_MS) {
          resetNow();
        } else {
          resetAnchorRef.current = anchor;
          if (!rawAnchor) await AsyncStorage.setItem(RESET_ANCHOR_KEY, String(anchor));
        }
      } catch (e) {
        console.warn('Failed to load payment log reset anchor', e);
      }
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel('payments-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchAll)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Diff `payments` against the database and push only what changed.
  useEffect(() => {
    if (loading) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    (async () => {
      const prev = lastSyncedRef.current;
      const prevById = new Map(prev.map((p) => [p.id, p]));
      const nextById = new Map(payments.map((p) => [p.id, p]));

      // Track whether every write this pass actually landed in Supabase.
      // Previously these awaits were fire-and-forget: if a write failed
      // (e.g. the `payments` table/columns not matching what the app
      // sends — like a `status` check constraint that doesn't know about
      // 'pending' yet), the error was silently dropped, but
      // `lastSyncedRef.current` still got set to the optimistic local
      // state below as if it HAD been saved. Then the next unrelated
      // realtime event (or reset) would fetchAll() and quietly overwrite
      // the screen with the database's real (un-updated) rows — which is
      // exactly what made "Log as Pending" look like it silently reverted:
      // the local state showed 'pending' for a moment, then vanished with
      // no error ever surfaced.
      let hadError = false;
      const failures: string[] = [];

      for (const p of prev) {
        if (!nextById.has(p.id)) {
          const { error } = await supabase.from('payments').delete().eq('id', p.id);
          if (error) {
            hadError = true;
            failures.push(error.message);
            console.warn('Failed to delete payment', p.id, error);
          }
        }
      }

      for (const p of payments) {
        const before = prevById.get(p.id);
        const row = {
          id: p.id,
          player_id: p.playerId ?? null,
          description: p.description,
          amount: p.amount,
          method: p.method,
          status: p.status,
          date: p.date,
          items: p.items ?? null,
        };
        if (!before) {
          const { error } = await supabase.from('payments').insert(row);
          if (error) {
            hadError = true;
            failures.push(error.message);
            console.warn('Failed to save payment', p.id, error);
          }
        } else if (JSON.stringify(before) !== JSON.stringify(p)) {
          const { error } = await supabase.from('payments').update(row).eq('id', p.id);
          if (error) {
            hadError = true;
            failures.push(error.message);
            console.warn('Failed to update payment', p.id, error);
          }
        }
      }

      if (hadError) {
        // Don't pretend the optimistic state is now the source of truth —
        // pull the real rows back from the database so the UI reflects
        // what's actually saved instead of silently drifting.
        const message = failures[0] ?? 'Unknown error';
        const isSchemaIssue =
          /schema cache|does not exist|violates check constraint|column .* of relation/i.test(
            message
          );
        Alert.alert(
          "Couldn't save payment",
          isSchemaIssue
            ? 'The payments table in Supabase is missing or out of date (e.g. it doesn\'t allow a "pending" status yet). Run supabase_fix_migration.sql in the Supabase SQL editor, then try again.'
            : `${message}\n\nYour change may not have been saved — please try again.`
        );
        await fetchAll(); // fetchAll already marks this as a remote read, not a local edit to push back
        return;
      }

      lastSyncedRef.current = payments;
    })();
  }, [payments, loading, fetchAll]);

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

  const removePayment = useCallback((id: string) => {
    setPayments((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const clearHistory = useCallback(() => {
    resetNow();
    setPayments([]);
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
