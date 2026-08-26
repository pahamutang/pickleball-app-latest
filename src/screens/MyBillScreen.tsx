import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { formatCurrency } from '../utils/currency';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';
import {
  Player,
  amountDue,
  grandTotal,
  isFullyPaid,
  isFullyUnpaid,
  orderTotal,
  paymentStatus,
} from '../types';

function statusColor(player: Player): string {
  if (isFullyPaid(player)) return AppColors.paidColor;
  if (isFullyUnpaid(player)) return AppColors.unpaidColor;
  return AppColors.partialColor;
}

export default function MyBillScreen({ onBack }: { onBack?: () => void }) {
  const { signOut, session } = useAuth();
  const [player, setPlayer] = useState<Player | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMine = useCallback(async () => {
    if (!session) return;
    const { data, error } = await supabase
      .from('players')
      .select('id, name, court_fee, court_fee_paid, order_items(id, name, price, quantity, is_paid)')
      .eq('linked_user_id', session.user.id)
      .maybeSingle();
    if (error) {
      console.warn('Failed to load your bill', error);
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
    setLoading(false);
  }, [session]);

  useEffect(() => {
    fetchMine();
    const channel = supabase
      .channel('my-bill-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, fetchMine)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'order_items' }, fetchMine)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchMine]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={AppColors.forestGreen} size="large" />
      </View>
    );
  }

  if (!player) {
    // The owner removed this session row (e.g. cleared for the day).
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>No active session found for your account right now.</Text>
        {onBack && (
          <Pressable onPress={onBack} style={styles.signOutBtn}>
            <Text style={styles.signOutText}>‹ Back to booking</Text>
          </Pressable>
        )}
        <Pressable onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  const color = statusColor(player);
  const due = amountDue(player);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          {onBack && (
            <Pressable onPress={onBack} accessibilityRole="button" accessibilityLabel="Back to booking" style={styles.backBtn}>
              <Text style={styles.backBtnText}>‹</Text>
            </Pressable>
          )}
          <Text style={styles.title}>My Bill</Text>
        </View>
        <Pressable onPress={signOut}>
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
          <>
            <Text style={styles.ordersLabel}>Orders</Text>
            {player.orders.map((o) => (
              <View key={o.id} style={styles.row}>
                <Text style={styles.rowText} numberOfLines={1}>
                  {o.name} x{o.quantity}
                </Text>
                <Text style={styles.rowAmount}>{formatCurrency(orderTotal(o))}</Text>
                <Text style={[styles.chipText, { color: o.isPaid ? AppColors.paidColor : AppColors.unpaidColor }]}>
                  {o.isPaid ? 'PAID' : 'UNPAID'}
                </Text>
              </View>
            ))}
          </>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyText: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 16 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backBtn: { paddingVertical: 4, paddingRight: 8, paddingLeft: 2 },
  backBtnText: { fontSize: 26, fontWeight: 'bold', color: AppColors.forestGreen, marginTop: -2 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a1a1a' },
  signOutTextSmall: { color: '#888', fontSize: 13 },
  signOutBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  signOutText: { color: AppColors.forestGreen, fontWeight: '600' },
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
  ordersLabel: { marginTop: 8, marginBottom: 2, fontWeight: '600', fontSize: 13, color: '#222' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  totalAmount: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  dueRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  dueLabel: { fontSize: 13, color: AppColors.crimsonRed, fontWeight: '600' },
  dueAmount: { fontSize: 13, color: AppColors.crimsonRed, fontWeight: '600' },
  note: { fontSize: 12, color: '#888', textAlign: 'center', marginTop: 16, lineHeight: 17 },
});
