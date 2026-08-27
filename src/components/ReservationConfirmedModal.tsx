import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { Reservation, formatFriendlyDate, reservationTotal, slotLabelsForHours } from '../bookingTypes';
import { formatCurrency } from '../utils/currency';

// Themed replacement for the old Alert.alert('Reservation confirmed', ...)
// popup — shows the same info (who/what/when/total) as a proper summary
// card instead of a plain system alert with a wall of text.
//
// Takes an *array* of reservations rather than one, since a single booking
// action can now cover multiple courts at once (one Reservation row per
// court under the hood) — each shows as its own line, with one combined
// total at the bottom.
export default function ReservationConfirmedModal({
  reservations,
  onClose,
}: {
  reservations: Reservation[] | null;
  onClose: () => void;
}) {
  const list = reservations ?? [];
  const grandTotal = list.reduce((sum, r) => sum + reservationTotal(r), 0);
  const multi = list.length > 1;

  return (
    <Modal visible={list.length > 0} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.iconBadge}>
            <Text style={styles.iconText}>✅</Text>
          </View>

          <Text style={styles.title}>
            {multi ? `${list.length} courts reserved` : 'Reservation confirmed'}
          </Text>

          {list.length > 0 && (
            <View style={styles.summaryCard}>
              <Text style={styles.customerName}>{list[0].customerName}</Text>
              <Text style={styles.detailLine}>{formatFriendlyDate(list[0].date)}</Text>

              {list.map((reservation, i) => (
                <View key={reservation.id} style={i > 0 ? styles.courtBlock : undefined}>
                  <Text style={styles.detailLineStrong}>{reservation.court}</Text>
                  <Text style={styles.detailLine}>{slotLabelsForHours(reservation.hours).join(', ')}</Text>
                  {multi && (
                    <Text style={styles.detailLineSubtotal}>
                      {formatCurrency(reservationTotal(reservation))}
                    </Text>
                  )}
                </View>
              ))}

              <View style={styles.divider} />

              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalValue}>{formatCurrency(grandTotal)}</Text>
              </View>
            </View>
          )}

          <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonLabel}>Done</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(4,14,20,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingTop: 28,
    paddingHorizontal: 24,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconBadge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#E6F5EA',
    borderWidth: 1,
    borderColor: '#BEE6C9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  iconText: { fontSize: 26 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  summaryCard: {
    width: '100%',
    backgroundColor: AppColors.background,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  customerName: { fontSize: 15, fontWeight: '700', color: '#1a1a1a' },
  detailLine: { fontSize: 13, color: '#555', marginTop: 4 },
  detailLineStrong: { fontSize: 13, color: '#1a1a1a', fontWeight: '700', marginTop: 10 },
  detailLineSubtotal: { fontSize: 12, color: '#888', marginTop: 2 },
  courtBlock: { marginTop: 2 },
  divider: { height: 1, backgroundColor: '#e6e6e0', marginTop: 12, marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 13, color: '#666', fontWeight: '600' },
  totalValue: { fontSize: 18, fontWeight: '800', color: AppColors.forestGreen },
  button: {
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    width: '100%',
    marginTop: 20,
    backgroundColor: AppColors.forestGreen,
  },
  buttonLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
