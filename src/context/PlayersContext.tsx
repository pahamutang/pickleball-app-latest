import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Alert } from '../utils/dialog';
import { supabase } from '../services/supabaseClient';
import { Player } from '../types';

interface PlayersContextValue {
  players: Player[];
  // Exposed with the exact same signature as React's own setState so
  // HomeScreen's existing updatePlayer/handleAddPlayer/etc. logic doesn't
  // need to change at all — only the storage backend underneath changed
  // (AsyncStorage -> Supabase, synced live to/from the database).
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  loading: boolean;
}

const PlayersContext = createContext<PlayersContextValue | undefined>(undefined);

type PlayerRow = {
  id: string;
  name: string;
  court_fee: number;
  court_fee_paid: boolean;
  order_items: OrderItemRow[] | null;
  linked_user_id: string | null;
};

type OrderItemRow = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  is_paid: boolean;
};

function rowToPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    courtFee: Number(row.court_fee),
    courtFeePaid: row.court_fee_paid,
    orders: (row.order_items ?? []).map((o) => ({
      id: o.id,
      name: o.name,
      price: Number(o.price),
      quantity: o.quantity,
      isPaid: o.is_paid,
    })),
    linkedUserId: row.linked_user_id ?? undefined,
  };
}

export function PlayersProvider({ children }: { children: ReactNode }) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);

  // What we last knew to be true in the database — used to diff against
  // whatever the caller passes into setPlayers, so we only push the rows
  // that actually changed instead of re-writing everything every time.
  const lastSyncedRef = useRef<Player[]>([]);
  // True while we're applying a fetch/realtime update into local state, so
  // the sync effect below doesn't try to "write back" data we just read.
  const applyingRemoteRef = useRef(false);
  // Coalesce overlapping refetch requests instead of dropping them — see
  // the matching comment in BookingContext.tsx. A single "add player +
  // add order items" burst fires several sequential writes, each of which
  // triggers its own realtime event -> fetchAll() call across the two
  // subscribed tables. If a fetch is still in flight when the next event
  // arrives, bailing out silently would leave `players` stuck missing
  // whichever update raced the in-flight fetch.
  const fetchingRef = useRef(false);
  const refetchPendingRef = useRef(false);
  // Sync passes must run ONE AT A TIME. Each pass is a series of awaited
  // writes and only updates lastSyncedRef at the very end; if the user
  // makes a second edit while the first pass is still writing, a second
  // pass used to start concurrently, diff against the STALE lastSyncedRef,
  // and re-insert rows the first pass had already inserted (duplicate-key
  // errors + a bogus "Couldn't save" alert). Chaining them fixes that.
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  const fetchAll = useCallback(async () => {
    if (fetchingRef.current) {
      refetchPendingRef.current = true;
      return;
    }
    fetchingRef.current = true;
    try {
      do {
        refetchPendingRef.current = false;
        const { data, error } = await supabase
          .from('players')
          .select(
            'id, name, court_fee, court_fee_paid, linked_user_id, order_items(id, name, price, quantity, is_paid)'
          )
          .order('created_at', { ascending: true });
        if (error) {
          console.warn('Failed to load players', error);
          break;
        }
        const rows = (data ?? []) as PlayerRow[];
        const mapped = rows.map(rowToPlayer);
        applyingRemoteRef.current = true;
        lastSyncedRef.current = mapped;
        setPlayers(mapped);
      } while (refetchPendingRef.current);
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  // A realtime event (often the echo of our own write) must not refetch
  // while our writes are still going out — the fetch would snapshot a
  // half-written database and overwrite the user's newer local edits.
  // Wait for any in-flight sync pass first, then fetch.
  const onRemoteChange = useCallback(() => {
    syncChainRef.current.then(() => fetchAll());
  }, [fetchAll]);

  useEffect(() => {
    (async () => {
      await fetchAll();
      setLoading(false);
    })();

    const channel = supabase
      .channel('players-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, onRemoteChange)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, onRemoteChange)
      .subscribe();

    // Same gap as BookingContext had: a backgrounded (not force-quit) app
    // can silently drop its realtime connection, or simply miss changes
    // that happened while it wasn't listening. Re-fetch on every
    // foreground transition so reopening later always shows the
    // database's actual current state.
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') onRemoteChange();
    });

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Diff the latest `players` against what's actually in the database and
  // push only what changed. Mirrors the old "persist on every change"
  // effect, just against Supabase instead of AsyncStorage.
  useEffect(() => {
    if (loading) return;
    if (applyingRemoteRef.current) {
      applyingRemoteRef.current = false;
      return;
    }

    syncChainRef.current = syncChainRef.current.then(async () => {
      const prev = lastSyncedRef.current;
      const prevById = new Map(prev.map((p) => [p.id, p]));
      const nextById = new Map(players.map((p) => [p.id, p]));

      // As with payments: don't silently swallow write failures. If a
      // write fails, `lastSyncedRef.current` must NOT be set to the
      // optimistic local state, or the next fetchAll() (triggered by any
      // other realtime change) will look like data quietly vanished.
      let hadError = false;
      let firstError: string | null = null;
      const noteError = (context: string, error: { message: string }) => {
        hadError = true;
        if (!firstError) firstError = error.message;
        console.warn(`Failed to ${context}`, error);
      };

      // Removed players.
      for (const p of prev) {
        if (!nextById.has(p.id)) {
          const { error } = await supabase.from('players').delete().eq('id', p.id);
          if (error) noteError('delete player', error);
        }
      }

      for (const p of players) {
        const before = prevById.get(p.id);
        if (!before) {
          // New player.
          const { error } = await supabase.from('players').insert({
            id: p.id,
            name: p.name,
            court_fee: p.courtFee,
            court_fee_paid: p.courtFeePaid,
            linked_user_id: p.linkedUserId ?? null,
          });
          if (error) noteError('save player', error);
        } else if (
          before.name !== p.name ||
          before.courtFee !== p.courtFee ||
          before.courtFeePaid !== p.courtFeePaid ||
          before.linkedUserId !== p.linkedUserId
        ) {
          const { error } = await supabase
            .from('players')
            .update({
              name: p.name,
              court_fee: p.courtFee,
              court_fee_paid: p.courtFeePaid,
              linked_user_id: p.linkedUserId ?? null,
            })
            .eq('id', p.id);
          if (error) noteError('update player', error);
        }

        // Order items for this player.
        const beforeOrders = before?.orders ?? [];
        const beforeOrdersById = new Map(beforeOrders.map((o) => [o.id, o]));
        const nextOrdersById = new Map(p.orders.map((o) => [o.id, o]));

        for (const o of beforeOrders) {
          if (!nextOrdersById.has(o.id)) {
            const { error } = await supabase.from('order_items').delete().eq('id', o.id);
            if (error) noteError('delete order item', error);
          }
        }
        for (const o of p.orders) {
          const beforeOrder = beforeOrdersById.get(o.id);
          if (!beforeOrder) {
            const { error } = await supabase.from('order_items').insert({
              id: o.id,
              player_id: p.id,
              name: o.name,
              price: o.price,
              quantity: o.quantity,
              is_paid: o.isPaid,
            });
            if (error) noteError('save order item', error);
          } else if (
            beforeOrder.name !== o.name ||
            beforeOrder.price !== o.price ||
            beforeOrder.quantity !== o.quantity ||
            beforeOrder.isPaid !== o.isPaid
          ) {
            const { error } = await supabase
              .from('order_items')
              .update({ name: o.name, price: o.price, quantity: o.quantity, is_paid: o.isPaid })
              .eq('id', o.id);
            if (error) noteError('update order item', error);
          }
        }
      }

      if (hadError) {
        const message = firstError ?? 'Unknown error';
        const isSchemaIssue =
          /schema cache|does not exist|violates check constraint|column .* of relation/i.test(
            message
          );
        Alert.alert(
          "Couldn't save changes",
          isSchemaIssue
            ? 'The players/orders tables in Supabase are missing or out of date. Run supabase_fix_migration.sql in the Supabase SQL editor, then try again.'
            : `${message}\n\nYour change may not have been saved — please try again.`
        );
        await fetchAll(); // resync with what's actually in the database
        return;
      }

      lastSyncedRef.current = players;
    }).catch((e) => console.warn('Player sync pass failed', e));
  }, [players, loading, fetchAll]);

  return (
    <PlayersContext.Provider value={{ players, setPlayers, loading }}>
      {children}
    </PlayersContext.Provider>
  );
}

export function usePlayers() {
  const ctx = useContext(PlayersContext);
  if (!ctx) {
    throw new Error('usePlayers must be used within a PlayersProvider');
  }
  return ctx;
}
