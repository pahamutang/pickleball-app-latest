import React, { useMemo, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  BackHandler,
  Alert,
} from 'react-native';
import { AppColors } from '../colors';
import { Payment, PaymentStatus } from '../payment';
import { usePaymentLog } from '../context/PaymentLogContext';
import { usePlayers } from '../context/PlayersContext';

type FilterOption = 'all' | PaymentStatus;

interface Props {
  onDone: () => void;
}

const STATUS_COLORS: Record<PaymentStatus, string> = {
  paid: '#2E7D32',
  pending: '#F9A825',
  failed: '#C62828',
};

function formatCurrency(amount: number) {
  return `₱${amount.toFixed(2)}`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function PaymentHistoryScreen({ onDone }: Props) {
  // Real payments logged from HomeScreen (cash-register confirm + manual
  // PAID chip taps) — no more mock data.
  const { payments, clearHistory, removePayment } = usePaymentLog();
  const { setPlayers } = usePlayers();
  const [filter, setFilter] = useState<FilterOption>('all');
  // Which row is currently expanded to show its item breakdown. Tapping the
  // same row again collapses it; tapping a different row switches to it.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleClearHistory = () => {
    if (payments.length === 0) return;
    Alert.alert(
      'Clear payment history?',
      'This removes all logged payments. This can\'t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: clearHistory },
      ]
    );
  };

  // If a PAID entry gets removed, the items it covered need to go back to
  // being unpaid on the player too — otherwise the home screen would still
  // show them as fully paid (amountDue = 0) with no way to re-collect,
  // even though their payment record just disappeared.
  const revertPlayerItems = (payment: Payment) => {
    if (!payment.playerId) return;
    const keys = new Set((payment.items ?? []).map((li) => li.description));
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== payment.playerId) return p;
        return {
          ...p,
          courtFeePaid: keys.has('Court fee') ? false : p.courtFeePaid,
          orders: p.orders.map((o) =>
            keys.has(`${o.name} x${o.quantity}`) ? { ...o, isPaid: false } : o
          ),
        };
      })
    );
  };

  // The ✕ on a row. This is the only way a player's current log entry goes
  // away — until this is tapped, any further payment activity for that
  // player edits this same row instead of adding a new one. Removing a
  // PAID entry also un-marks those items on the player so they can be
  // re-collected; pending/failed entries have nothing to revert since
  // those items were never marked paid in the first place.
  const handleRemovePayment = (payment: Payment) => {
    const isPaidEntry = payment.status === 'paid';
    Alert.alert(
      'Remove this entry?',
      isPaidEntry
        ? `"${payment.description}" will be removed, and those item(s) will be marked unpaid again so you can re-collect.`
        : `"${payment.description}" will be removed from the log. Their next payment will start a fresh entry.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            if (isPaidEntry) revertPlayerItems(payment);
            removePayment(payment.id);
          },
        },
      ]
    );
  };

  // Handle Android hardware back button
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      onDone();
      return true; // Prevent default back behavior (exiting the app)
    });

    return () => backHandler.remove();
  }, [onDone]);

  const filteredPayments = useMemo(() => {
    if (filter === 'all') return payments;
    return payments.filter((p) => p.status === filter);
  }, [filter, payments]);

  const totalPaid = useMemo(
    () => payments.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  // Cash physically collected so far, including partial/pending amounts —
  // distinct from "Total Paid", which only counts fully-settled entries.
  const cashCollected = useMemo(
    () =>
      payments
        .filter((p) => p.status === 'paid' || p.status === 'pending')
        .reduce((sum, p) => sum + p.amount, 0),
    [payments]
  );

  const filters: { key: FilterOption; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'paid', label: 'Paid' },
    { key: 'pending', label: 'Pending' },
    { key: 'failed', label: 'Failed' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={onDone}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.backButtonContainer}
          accessibilityLabel="Back to home"
          accessibilityRole="button"
        >
          <Text style={styles.backButton}>{'← Back'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Payment History</Text>
        <TouchableOpacity
          onPress={handleClearHistory}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          style={styles.clearButtonContainer}
          disabled={payments.length === 0}
          accessibilityLabel="Clear payment history"
          accessibilityRole="button"
        >
          <Text style={[styles.clearButton, payments.length === 0 && styles.clearButtonDisabled]}>
            Clear
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryCard, styles.summaryCardHalf]}>
          <Text style={styles.summaryLabel}>Total Paid</Text>
          <Text style={styles.summaryAmount}>{formatCurrency(totalPaid)}</Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardHalf]}>
          <Text style={styles.summaryLabel}>Cash Collected</Text>
          <Text style={[styles.summaryAmount, { color: AppColors.gold }]}>
            {formatCurrency(cashCollected)}
          </Text>
        </View>
      </View>

      <View style={styles.filterRow}>
        {filters.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filterChip, filter === f.key && styles.filterChipActive]}
            onPress={() => setFilter(f.key)}
          >
            <Text
              style={[
                styles.filterChipText,
                filter === f.key && styles.filterChipTextActive,
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={filteredPayments}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No transactions found.</Text>
        }
        renderItem={({ item }) => {
          const hasItems = !!item.items && item.items.length > 0;
          const isExpanded = expandedId === item.id;
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={hasItems ? 0.6 : 1}
              disabled={!hasItems}
              onPress={() => setExpandedId(isExpanded ? null : item.id)}
            >
              <TouchableOpacity
                onPress={() => handleRemovePayment(item)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.removeButton}
                accessibilityLabel={`Remove entry: ${item.description}`}
                accessibilityRole="button"
              >
                <Text style={styles.removeButtonText}>✕</Text>
              </TouchableOpacity>

              <View style={styles.rowMain}>
                <View style={{ flex: 1 }}>
                  <View style={styles.rowTitleLine}>
                    <Text style={[styles.rowTitle, { flexShrink: 1 }]}>{item.description}</Text>
                    {hasItems && (
                      <Text style={styles.expandIcon}>{isExpanded ? '▲' : '▼'}</Text>
                    )}
                  </View>
                  <Text style={styles.rowSubtitle}>
                    {formatDate(item.date)} · {item.method}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rowAmount}>{formatCurrency(item.amount)}</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: STATUS_COLORS[item.status] },
                    ]}
                  >
                    <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              {isExpanded && hasItems && (
                <View style={styles.itemsBreakdown}>
                  {item.items!.map((line, idx) => (
                    <View key={idx} style={styles.itemLineRow}>
                      <Text style={styles.itemLine}>• {line.description}</Text>
                      <Text style={styles.itemLineAmount}>{formatCurrency(line.amount)}</Text>
                    </View>
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 48,  // Extra top padding for status bar/notch
    backgroundColor: AppColors.forestGreen,
  },
  backButtonContainer: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 90,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  backButton: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '600',
  },
  clearButtonContainer: {
    minWidth: 60,
    alignItems: 'flex-end',
  },
  clearButton: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  clearButtonDisabled: {
    color: 'rgba(255,255,255,0.4)',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  summaryCardHalf: {
    flex: 1,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryAmount: {
    fontSize: 28,
    fontWeight: '700',
    color: AppColors.forestGreen,
    marginTop: 4,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
  },
  filterChipActive: {
    backgroundColor: AppColors.forestGreen,
  },
  filterChipText: {
    fontSize: 13,
    color: '#333',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  row: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 14,
    paddingRight: 34,
    marginBottom: 10,
    position: 'relative',
  },
  removeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  removeButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#888',
  },
  rowMain: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  expandIcon: {
    fontSize: 10,
    color: '#999',
  },
  rowTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#222',
  },
  rowSubtitle: {
    fontSize: 12,
    color: '#888',
    marginTop: 2,
  },
  rowAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#222',
  },
  statusBadge: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyText: {
    textAlign: 'center',
    color: '#888',
    marginTop: 40,
  },
  itemsBreakdown: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEEEEE',
  },
  itemLineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  itemLine: {
    fontSize: 13,
    color: '#555',
  },
  itemLineAmount: {
    fontSize: 13,
    color: '#555',
    fontWeight: '600',
  },
});
