import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, AppStateStatus, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { formatCurrency } from '../utils/currency';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  Player,
  amountDue,
  generateId,
  grandTotal,
  isFullyPaid,
  isFullyUnpaid,
  ordersTotal,
  paymentStatus,
} from '../types';
import OrdersModal from '../components/OrdersModal';

function statusColor(player: Player): string {
  if (isFullyPaid(player)) return AppColors.paidColor;
  if (isFullyUnpaid(player)) return AppColors.unpaidColor;
  return AppColors.partialColor;
}

export default function MyBillScreen({
  onBack,
  onRejoin,
}: {
  onBack?: () => void;
  // Called when the player wants to start a new session/order after their
  // previous one was cleared by the owner. Sends them back to
  // JoinSessionScreen. Optional so this component doesn't break if some
  // other caller doesn't wire it up.
  onRejoin?: () => void;
}) {
  const { signOut, session } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);
  const [ordersModalVisible, setOrdersModalVisible] = useState(false);

  const fetchMine = useCallback(async () => {
    // Guards against a stuck spinner with no way out: if this ever runs
    // before the session is ready (it shouldn't in normal use, since
    // App.tsx only mounts this screen once a session + profile exist,
    // but a realtime event or a fast re-render could still call fetchMine
    // in a brief window before `session` updates), loading must still be
    // cleared so the screen falls through to a state with a back button
    // instead of showing only a spinner forever.
    if (!session) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('players')
        .select('id, name, court_fee, court_fee_paid, order_items(id, name, price, quantity, is_paid)')
        .eq('linked_user_id', session.user.id)
        .maybeSingle();
      if (error) {
        console.warn('Failed to load your bill', error);
        // A failed refresh shouldn't wipe out whatever was last shown
        // successfully — leave `player` as-is so the screen (and its
        // back button) stays put instead of flipping to a confusing
        // empty state on a transient network hiccup.
        setLoading(false);
        return;
      }
      if (!data) {
        setPlayer(null);
        setLoading(false);
        return;
      }
      setPlayer({
        id: data.id,
        name: data.name,
        courtFee: Number(data.court_fee),
        courtFeePaid: data.court_fee_paid,
        orders: (data.order_items ?? []).map((o: any) => ({
          id: o.id,
          name: o.name,
          price: Number(o.price),
          quantity: o.quantity,
          isPaid: o.is_paid,
        })),
      });
    } catch (err) {
      // A thrown network/client error (as opposed to a Supabase `error`
      // field) must not leave the spinner running forever with nothing
      // else on screen — always fall through to a state with a way back.
      console.warn('Unexpected error loading your bill', err);
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    fetchMine();
    // A unique channel name per mount avoids collisions from a previous
    // mount's channel that hasn't finished tearing down yet (e.g. quick
    // tab switches) — a reused fixed name here could leave realtime
    // updates silently not (re)subscribed on a later visit to this screen.
    const channel = supabase
      .channel(`my-bill-sync-${generateId()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchMine)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchMine)
      .subscribe();

    // Same gap as BookingContext had: without this, a player who had the
    // app merely backgrounded (not force-quit) while the owner added an
    // order or marked something paid would only see it once they happen
    // to be foregrounded at the same live moment. Re-fetch on every
    // foreground transition so opening the bill later always reflects
    // what's actually in the database.
    const appStateSub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (next === 'active') fetchMine();
    });

    return () => {
      supabase.removeChannel(channel);
      appStateSub.remove();
    };
  }, [fetchMine]);

  if (loading) {
    return (
      <View style={styles.center}>
        <View style={styles.centerCard}>
          <ActivityIndicator color={AppColors.forestGreen} size="large" />
          {onBack && (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [styles.primaryBtn, { marginTop: 20 }, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Back to booking"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>‹ Back to booking</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  if (!player) {
    // The owner removed this session row (e.g. cleared for the day).
    return (
      <View style={styles.center}>
        <View style={styles.centerCard}>
          <Image source={require('../../assets/mt_pickle_logo.jpg')} style={styles.emptyLogo} />
          <Text style={styles.emptyText}>No active session found for your account right now.</Text>
          {onRejoin && (
            <Pressable
              onPress={onRejoin}
              style={({ pressed }) => [styles.primaryBtn, pressed && styles.btnPressed]}
              accessibilityRole="button"
              accessibilityLabel="Order again"
              hitSlop={8}
            >
              <Text style={styles.primaryBtnText}>Order again</Text>
            </Pressable>
          )}
          {onBack && (
            <Pressable
              onPress={onBack}
              style={({ pressed }) => [
                onRejoin ? styles.secondaryBtn : styles.primaryBtn,
                { marginTop: onRejoin ? 12 : 0 },
                pressed && styles.btnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Back to booking"
              hitSlop={8}
            >
              <Text style={onRejoin ? styles.secondaryBtnText : styles.primaryBtnText}>
                ‹ Back to booking
              </Text>
            </Pressable>
          )}
          <Pressable
            onPress={signOut}
            style={({ pressed }) => [styles.textOnlyBtn, pressed && styles.btnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            hitSlop={8}
          >
            <Text style={styles.textOnlyBtnText}>Sign out</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const color = statusColor(player);
  const due = amountDue(player);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={[styles.headerRow, { marginTop: 8 }]}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel="Back to booking"
              style={styles.backBtn}
              hitSlop={12}
            >
              <Text style={styles.backBtnText}>‹</Text>
            </Pressable>
          )}
          <Text style={styles.title}>My Bill</Text>
        </View>
        <Pressable onPress={signOut} style={styles.signOutBtnSmall} hitSlop={12}>
          <Text style={styles.signOutTextSmall}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{player.name}</Text>
          <View style={[styles.statusBadge, { borderColor: color, backgroundColor: color + '26' }]}>
            <Text style={[styles.statusText, { color }]}>{paymentStatus(player)}</Text>
          </View>
        </View>
        <View style={styles.divider} />

        <View style={styles.row}>
          <Text style={styles.rowText}>Court fee</Text>
          <Text style={styles.rowAmount}>{formatCurrency(player.courtFee)}</Text>
          <Text style={[styles.chipText, { color: player.courtFeePaid ? AppColors.paidColor : AppColors.unpaidColor }]}>
            {player.courtFeePaid ? 'PAID' : 'UNPAID'}
          </Text>
        </View>

        {player.orders.length > 0 && (
          <Pressable
            onPress={() => setOrdersModalVisible(true)}
            style={styles.ordersSummaryRow}
            accessibilityRole="button"
            accessibilityLabel="View my orders"
          >
            <Text style={styles.ordersLabel}>
              Orders ({player.orders.length}) — {formatCurrency(ordersTotal(player))}
            </Text>
            <Text style={styles.ordersChevron}>›</Text>
          </Pressable>
        )}

        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalAmount}>{formatCurrency(grandTotal(player))}</Text>
        </View>
        {due > 0 && (
          <View style={styles.dueRow}>
            <Text style={styles.dueLabel}>Still due</Text>
            <Text style={styles.dueAmount}>{formatCurrency(due)}</Text>
          </View>
        )}
      </View>

      <Text style={styles.note}>
        This is a live, read-only view. Please pay the owner directly — this app doesn't handle
        payments itself.
      </Text>

      <OrdersModal
        visible={ordersModalVisible}
        onClose={() => setOrdersModalVisible(false)}
        playerName={player.name}
        orders={player.orders}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.background },
  center: {
    flex: 1,
    backgroundColor: AppColors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 32,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  emptyLogo: { width: 64, height: 64, borderRadius: 14, marginBottom: 14 },
  emptyText: { fontSize: 14, color: '#444', textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  primaryBtn: {
    width: '100%',
    minHeight: 50,
    backgroundColor: AppColors.forestGreen,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryBtn: {
    width: '100%',
    minHeight: 50,
    backgroundColor: '#F1F1EC',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  secondaryBtnText: { color: AppColors.forestGreen, fontWeight: '700', fontSize: 14 },
  textOnlyBtn: { paddingVertical: 12, marginTop: 4 },
  textOnlyBtnText: { color: AppColors.crimsonRed, fontWeight: '600', fontSize: 13 },
  btnPressed: { opacity: 0.8 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { paddingVertical: 10, paddingRight: 10, paddingLeft: 4 },
  backBtnText: { fontSize: 30, fontWeight: 'bold', color: AppColors.forestGreen, marginTop: -2 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a1a1a' },
  signOutBtnSmall: { paddingVertical: 10, paddingHorizontal: 8 },
  signOutTextSmall: { color: '#888', fontSize: 13 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(11,48,31,0.08)',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { fontSize: 20, fontWeight: 'bold', color: '#1a1a1a' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  statusText: { fontWeight: 'bold', fontSize: 12 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowText: { flex: 1, fontSize: 14, color: '#222' },
  rowAmount: { fontSize: 14, color: '#222', marginRight: 10, fontVariant: ['tabular-nums'] },
  chipText: { fontSize: 11, fontWeight: 'bold', minWidth: 52, textAlign: 'right' },
  ordersSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 4,
  },
  ordersLabel: { fontWeight: '600', fontSize: 13, color: '#222' },
  ordersChevron: { fontSize: 18, color: '#999', fontWeight: 'bold' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  totalAmount: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dueLabel: { fontSize: 13, color: AppColors.crimsonRed, fontWeight: '600' },
  dueAmount: { fontSize: 13, color: AppColors.crimsonRed, fontWeight: '600' },
  note: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
