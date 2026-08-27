import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { formatCurrency } from '../utils/currency';
import { OrderItem, orderTotal } from '../types';
import PaidChip from './PaidChip';

// Full-orders view for a single player. Used by both sides of the app:
//  - Owner (PlayerCard, editable=true): can toggle paid, edit, and remove.
//  - Player (MyBillScreen, editable=false): read-only status only.
// Always renders as a dimmed-backdrop modal with a single top-right ✕ to
// close, regardless of how many orders there are — this is the one place
// a player's full order list is shown, so the card behind it can stay
// short no matter how many orders pile up.
export default function OrdersModal({
  visible,
  onClose,
  playerName,
  orders,
  editable = false,
  onToggleOrderPaid,
  onEditOrder,
  onRemoveOrder,
}: {
  visible: boolean;
  onClose: () => void;
  playerName: string;
  orders: OrderItem[];
  editable?: boolean;
  onToggleOrderPaid?: (order: OrderItem) => void;
  onEditOrder?: (order: OrderItem) => void;
  onRemoveOrder?: (orderId: string) => void;
}) {
  const total = orders.reduce((sum, o) => sum + orderTotal(o), 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.closeIcon}>✕</Text>
          </Pressable>

          <Text style={styles.title} numberOfLines={1}>
            {playerName}'s Orders
          </Text>
          <View style={styles.divider} />

          {orders.length === 0 ? (
            <Text style={styles.emptyText}>No orders yet.</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
              {orders.map((o) => (
                <View key={o.id} style={styles.orderRow}>
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderName} numberOfLines={2}>
                      {o.name} x{o.quantity}
                    </Text>
                    <Text style={styles.orderAmount}>{formatCurrency(orderTotal(o))}</Text>
                  </View>

                  {editable ? (
                    <View style={styles.orderActions}>
                      <PaidChip paid={o.isPaid} onPress={() => onToggleOrderPaid?.(o)} />
                      <Pressable
                        onPress={() => onEditOrder?.(o)}
                        hitSlop={8}
                        style={styles.iconBtn}
                        accessibilityLabel={`Edit ${o.name}`}
                      >
                        <Text style={styles.editIcon}>✎</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => onRemoveOrder?.(o.id)}
                        hitSlop={8}
                        style={styles.iconBtn}
                        accessibilityLabel={`Remove ${o.name}`}
                      >
                        <Text style={styles.removeIcon}>×</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Text
                      style={[
                        styles.statusChip,
                        { color: o.isPaid ? AppColors.paidColor : AppColors.unpaidColor },
                      ]}
                    >
                      {o.isPaid ? 'PAID' : 'UNPAID'}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}

          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Orders total</Text>
            <Text style={styles.totalAmount}>{formatCurrency(total)}</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,20,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '80%',
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  closeBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F1EC',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  closeIcon: { fontSize: 15, fontWeight: 'bold', color: '#555' },
  title: { fontSize: 18, fontWeight: 'bold', color: '#1a1a1a', paddingRight: 40 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 12 },
  emptyText: { fontSize: 14, color: '#888', textAlign: 'center', paddingVertical: 12 },
  list: { flexGrow: 0 },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f2f2f2',
  },
  orderInfo: { flex: 1, marginRight: 10 },
  orderName: { fontSize: 14, color: '#222', fontWeight: '600' },
  orderAmount: { fontSize: 13, color: '#666', marginTop: 2, fontVariant: ['tabular-nums'] },
  orderActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
  editIcon: { fontSize: 15, color: AppColors.forestGreen },
  removeIcon: { fontSize: 18, color: '#888' },
  statusChip: { fontSize: 11, fontWeight: 'bold', minWidth: 52, textAlign: 'right' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '600', color: '#444' },
  totalAmount: { fontSize: 16, fontWeight: 'bold', color: '#1a1a1a' },
});
