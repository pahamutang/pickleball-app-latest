import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { Reservation, formatFriendlyDate, reservationTotal, slotLabelsForHours } from '../bookingTypes';
import { formatCurrency } from '../utils/currency';
import PaidChip from './PaidChip';

export interface ReservationGroup {
  key: string;
  customerName: string;
  date: string;
  items: Reservation[];
  total: number;
}

// Full-screen(ish) list of every upcoming reservation, park-wide. Pulled
// out from the home screen's inline list into a modal behind a button so
// that a busy day with many bookings doesn't stack up and push the rest
// of the home screen (venue info, location, etc.) further and further
// down — the trigger button shows a count, and this is where the actual
// list lives now.
export default function UpcomingReservationsModal({
  visible,
  onClose,
  groups,
  isOwner,
  canCancel,
  onTogglePaid,
  onCancel,
}: {
  visible: boolean;
  onClose: () => void;
  groups: ReservationGroup[];
  isOwner: boolean;
  canCancel: (r: Reservation) => boolean;
  onTogglePaid: (r: Reservation) => void;
  onCancel: (r: Reservation) => void;
}) {
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

          <Text style={styles.title}>Upcoming Reservations</Text>
          <View style={styles.divider} />

          {groups.length === 0 ? (
            <Text style={styles.emptyText}>No upcoming reservations yet.</Text>
          ) : (
            <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
              {groups.map((g) => {
                if (g.items.length === 1) {
                  const r = g.items[0];
                  return (
                    <View key={g.key} style={styles.reservationCard}>
                      <View style={styles.reservationHeader}>
                        <Text style={styles.reservationName}>{r.customerName}</Text>
                        <PaidChip paid={r.isPaid} onPress={isOwner ? () => onTogglePaid(r) : undefined} />
                      </View>
                      <Text style={styles.reservationDetail}>
                        {r.court} · {formatFriendlyDate(r.date)}
                      </Text>
                      <Text style={styles.reservationDetail}>{slotLabelsForHours(r.hours).join(', ')}</Text>
                      <Text style={styles.reservationDetail}>
                        {r.players} player{r.players === 1 ? '' : 's'}
                        {r.notes ? ` · ${r.notes}` : ''}
                      </Text>
                      <View style={styles.reservationFooter}>
                        <Text style={styles.reservationTotal}>{formatCurrency(reservationTotal(r))}</Text>
                        {canCancel(r) && (
                          <Pressable onPress={() => onCancel(r)} accessibilityRole="button">
                            <Text style={styles.cancelText}>Cancel</Text>
                          </Pressable>
                        )}
                      </View>
                    </View>
                  );
                }

                return (
                  <View key={g.key} style={styles.reservationCard}>
                    <View style={styles.reservationHeader}>
                      <Text style={styles.reservationName}>{g.customerName}</Text>
                      <Text style={styles.reservationDetail}>{formatFriendlyDate(g.date)}</Text>
                    </View>
                    {g.items.map((r, i) => (
                      <View
                        key={r.id}
                        style={[
                          styles.reservationSubRow,
                          i < g.items.length - 1 && styles.reservationSubRowDivider,
                        ]}
                      >
                        <View style={styles.reservationSubMain}>
                          <View style={styles.reservationSubHeaderRow}>
                            <Text style={styles.reservationCourtName}>{r.court}</Text>
                            <PaidChip paid={r.isPaid} onPress={isOwner ? () => onTogglePaid(r) : undefined} />
                          </View>
                          <Text style={styles.reservationDetail}>{slotLabelsForHours(r.hours).join(', ')}</Text>
                          <Text style={styles.reservationDetail}>
                            {r.players} player{r.players === 1 ? '' : 's'}
                            {r.notes ? ` · ${r.notes}` : ''}
                          </Text>
                        </View>
                        <View style={styles.reservationSubAside}>
                          <Text style={styles.reservationTotal}>{formatCurrency(reservationTotal(r))}</Text>
                          {canCancel(r) && (
                            <Pressable
                              onPress={() => onCancel(r)}
                              accessibilityRole="button"
                              style={{ marginTop: 6 }}
                            >
                              <Text style={styles.cancelText}>Cancel</Text>
                            </Pressable>
                          )}
                        </View>
                      </View>
                    ))}
                    <View style={styles.reservationFooter}>
                      <Text style={styles.reservationDetail}>{g.items.length} courts</Text>
                      <Text style={styles.reservationTotal}>{formatCurrency(g.total)}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}
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
    maxWidth: 460,
    maxHeight: '82%',
    backgroundColor: AppColors.background,
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 16,
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
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    borderWidth: 1,
    borderColor: '#eee',
  },
  closeIcon: { fontSize: 15, fontWeight: 'bold', color: '#555' },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: AppColors.forestGreen,
    paddingRight: 40,
    paddingHorizontal: 4,
  },
  divider: { height: 1, backgroundColor: '#e5e3da', marginTop: 12, marginBottom: 4 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', paddingVertical: 20 },
  // flexShrink defaults to 0 in React Native (unlike web CSS, where it
  // defaults to 1) — without it, a long list won't actually scroll
  // within the card's maxHeight, it'll just push the card taller than
  // its bound and spill out. Explicit flexShrink: 1 is what makes this
  // ScrollView respect `card`'s maxHeight and become internally
  // scrollable instead — the whole point of this component existing.
  list: { flexGrow: 0, flexShrink: 1, marginTop: 8 },

  reservationCard: {
    backgroundColor: '#fff',
    marginBottom: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  reservationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  reservationName: { fontSize: 15, fontWeight: 'bold', color: '#222' },
  reservationDetail: { fontSize: 12.5, color: '#666', marginTop: 2 },
  reservationSubRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  reservationSubRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reservationSubMain: { flex: 1, paddingRight: 10 },
  reservationSubAside: { alignItems: 'flex-end' },
  reservationSubHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  reservationCourtName: { fontSize: 13.5, fontWeight: '700', color: '#222', marginRight: 8 },
  reservationFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  reservationTotal: { fontSize: 14, fontWeight: 'bold', color: AppColors.forestGreen },
  cancelText: { color: AppColors.crimsonRed, fontSize: 13, fontWeight: '600' },
});
