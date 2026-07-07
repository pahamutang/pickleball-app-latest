import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  OrderItem,
  Player,
  amountDue,
  grandTotal,
  isFullyPaid,
  isFullyUnpaid,
  orderTotal,
  paymentStatus,
} from '../types';
import { AppColors } from '../colors';
import { formatCurrency } from '../utils/currency';
import PaidChip from './PaidChip';

function statusColor(player: Player): string {
  if (isFullyPaid(player)) return AppColors.paidColor;
  if (isFullyUnpaid(player)) return AppColors.unpaidColor;
  return AppColors.partialColor;
}

export default function PlayerCard({
  player,
  onToggleCourtFeePaid,
  onToggleOrderPaid,
  onAddOrder,
  onEditOrder,
  onRemoveOrder,
  onDeletePlayer,
  onCollectPayment,
}: {
  player: Player;
  onToggleCourtFeePaid: () => void;
  onToggleOrderPaid: (order: OrderItem) => void;
  onAddOrder: () => void;
  onEditOrder: (order: OrderItem) => void;
  onRemoveOrder: (orderId: string) => void;
  onDeletePlayer: () => void;
  onCollectPayment: () => void;
}) {
  const color = statusColor(player);
  const due = amountDue(player);
  const fullyPaid = isFullyPaid(player);
  const fullyUnpaid = isFullyUnpaid(player);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <View style={[styles.statusBadge, { borderColor: color, backgroundColor: color + '26' }]}>
          <Text style={[styles.statusText, { color }]}>{paymentStatus(player)}</Text>
        </View>
        <Pressable onPress={onDeletePlayer} hitSlop={8} style={styles.deleteBtn}>
          <Text style={styles.deleteIcon}>✕</Text>
        </Pressable>
      </View>
      <View style={styles.divider} />

      <View style={styles.row}>
        <Text style={styles.rowText}>Court fee — {formatCurrency(player.courtFee)}</Text>
        <PaidChip paid={player.courtFeePaid} onPress={onToggleCourtFeePaid} />
      </View>

      {player.orders.length > 0 && (
        <>
          <Text style={styles.ordersLabel}>Orders:</Text>
          {player.orders.map((o) => (
            <View key={o.id} style={styles.orderRow}>
              <Text style={styles.orderText} numberOfLines={1}>
                {o.name} x{o.quantity} — {formatCurrency(orderTotal(o))}
              </Text>
              <PaidChip paid={o.isPaid} onPress={() => onToggleOrderPaid(o)} />
              <Pressable onPress={() => onEditOrder(o)} hitSlop={8} style={styles.editOrderBtn}>
                <Text style={styles.editOrderIcon}>✎</Text>
              </Pressable>
              <Pressable onPress={() => onRemoveOrder(o.id)} hitSlop={8} style={styles.removeOrderBtn}>
                <Text style={styles.removeOrderIcon}>×</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      <View style={styles.footerRow}>
        <Pressable onPress={onAddOrder} style={styles.addOrderBtn}>
          <Text style={styles.addOrderText}>+ Order</Text>
        </Pressable>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.totalText}>Total: {formatCurrency(grandTotal(player))}</Text>
          {!fullyPaid && !fullyUnpaid && (
            <Text style={styles.dueText}>Still due: {formatCurrency(due)}</Text>
          )}
        </View>
      </View>

      {due > 0 && (
        <Pressable onPress={onCollectPayment} style={styles.collectBtn}>
          <Text style={styles.collectText}>
            Collect Payment ({formatCurrency(due)} due)
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    marginHorizontal: 12,
    marginVertical: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(11,48,31,0.08)',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  name: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#1a1a1a' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 4,
  },
  statusText: { fontWeight: 'bold', fontSize: 12 },
  deleteBtn: { padding: 4 },
  deleteIcon: { fontSize: 16, color: '#888' },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, fontSize: 14, color: '#222' },
  ordersLabel: { marginTop: 6, fontWeight: '600', fontSize: 13, color: '#222' },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
    marginTop: 4,
  },
  orderText: { flex: 1, fontSize: 13, color: '#333' },
  editOrderBtn: { paddingHorizontal: 6 },
  editOrderIcon: { fontSize: 15, color: AppColors.forestGreen },
  removeOrderBtn: { paddingHorizontal: 6 },
  removeOrderIcon: { fontSize: 18, color: '#888' },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 10,
  },
  addOrderBtn: { paddingVertical: 6, paddingHorizontal: 4 },
  addOrderText: { color: AppColors.forestGreen, fontWeight: '600' },
  totalText: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
  dueText: { fontSize: 12, color: AppColors.navy, fontWeight: '600', marginTop: 2 },
  collectBtn: {
    marginTop: 10,
    backgroundColor: AppColors.crimsonRed,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  collectText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
