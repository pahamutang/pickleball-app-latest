import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AppColors } from '../colors';
import { Reservation, formatFriendlyDate, reservationTotal, slotLabelsForHours } from '../bookingTypes';
import { formatCurrency } from '../utils/currency';
import { GCASH } from '../paymentConfig';

const QR_IMAGE = require('../../assets/gcash_qr.jpg');
const QR_RATIO = 912 / 1345; // width / height of the QR image

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

  // Tap-to-enlarge: the QR is small inside the card, so tapping it opens a
  // big full-screen view that's much easier to scan from another phone.
  // Rendered as an overlay inside this same Modal (not a second nested
  // Modal, which behaves inconsistently across iOS/Android/web).
  const [qrOpen, setQrOpen] = useState(false);
  const { width: winW, height: winH } = useWindowDimensions();
  // Fill the full screen width; only shrink if the screen is too short.
  // Small QR inside the card: explicit pixel size (no percentage/aspectRatio
  // layout) so it always sits right under the "Pay with GCash" heading.
  const qrW = Math.min(240, winW - 96);
  const qrH = qrW / QR_RATIO;
  const [qrFailed, setQrFailed] = useState(false);

  // Fill the full screen width; only shrink if the screen is too short.
  const bigW = Math.min(winW, (winH - 120) * QR_RATIO);
  const bigH = bigW / QR_RATIO;

  // Never reopen with the QR still enlarged from last time.
  useEffect(() => {
    if (list.length === 0) setQrOpen(false);
  }, [list.length]);

  return (
    <Modal visible={list.length > 0} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          {/* Scrolls on small phones now that the GCash section makes the
              card taller; the Done button stays pinned below it. */}
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
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

          {/* How to pay — two options. Neither is required right now: paying
              here is a convenience only, and the owner/staff still confirm
              payment in person and mark the booking as paid themselves. */}
          {list.length > 0 && (
            <View style={styles.payWrap}>
              <Text style={styles.payHeading}>How would you like to pay?</Text>

              <View style={styles.cashCard}>
                <Text style={styles.cashTitle}>💵 Pay cash on the court</Text>
                <Text style={styles.cashText}>
                  Prefer cash? Just pay the owner/staff when you arrive at the court.
                </Text>
              </View>

              <Text style={styles.orText}>— or —</Text>

              <View style={styles.payCard}>
                <Text style={styles.payTitle}>Pay with GCash</Text>
                <Text style={styles.paySubtitle}>Scan the QR code below to pay online</Text>
                <Pressable
                  onPress={() => setQrOpen(true)}
                  style={styles.qrPress}
                  accessibilityRole="button"
                  accessibilityLabel="Enlarge GCash QR code"
                >
                  {qrFailed ? (
                    <View style={[styles.qr, { width: qrW, height: 80, justifyContent: 'center' }]}>
                      <Text style={styles.payMeta}>
                        Couldn't load the QR code. Please pay cash at the court instead.
                      </Text>
                    </View>
                  ) : (
                    <>
                      <Image
                        source={QR_IMAGE}
                        style={[styles.qr, { width: qrW, height: qrH }]}
                        resizeMode="contain"
                        onError={() => setQrFailed(true)}
                        accessibilityLabel="GCash QR code"
                      />
                      <View style={styles.enlargeBadge}>
                        <Text style={styles.enlargeBadgeText}>🔍 Tap to enlarge</Text>
                      </View>
                    </>
                  )}
                </Pressable>
                <Text style={styles.payAmount}>Amount to pay: {formatCurrency(grandTotal)}</Text>
                {!!GCASH.accountName && <Text style={styles.payMeta}>Account name: {GCASH.accountName}</Text>}
                {!!GCASH.number && <Text style={styles.payMeta}>GCash number: {GCASH.number}</Text>}
                <View style={styles.screenshotNote}>
                  <Text style={styles.screenshotText}>
                    📸 Screenshot your payment confirmation once you've finished paying, and show it
                    to the owner/staff when you arrive at the court.
                  </Text>
                </View>
              </View>
            </View>
          )}
          </ScrollView>

          <Pressable onPress={onClose} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonLabel}>Done</Text>
          </Pressable>
        </View>

        {qrOpen && (
          <Pressable
            style={styles.qrOverlay}
            onPress={() => setQrOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close enlarged QR code"
          >
            <Text style={styles.qrOverlayHint}>Scan this with GCash or your banking app</Text>
            <Image
              source={QR_IMAGE}
              style={{ width: bigW, height: bigH }}
              resizeMode="contain"
              accessibilityLabel="Enlarged GCash QR code"
            />
            <View style={styles.qrCloseBtn}>
              <Text style={styles.qrCloseText}>✕  Tap anywhere to close</Text>
            </View>
          </Pressable>
        )}
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
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  scroll: { width: '100%', flexShrink: 1 },
  scrollContent: { alignItems: 'center' },
  payWrap: { width: '100%', marginTop: 16, alignItems: 'center' },
  payHeading: { fontSize: 14, fontWeight: '800', color: '#1a1a1a', marginBottom: 10 },
  cashCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BEE6C9',
    backgroundColor: '#EEF8F0',
    padding: 14,
    alignItems: 'center',
  },
  cashTitle: { fontSize: 14, fontWeight: '800', color: AppColors.forestGreen },
  cashText: { fontSize: 12, color: '#3f5a48', marginTop: 4, textAlign: 'center', lineHeight: 17 },
  orText: { fontSize: 12, color: '#999', marginVertical: 8 },
  payCard: {
    width: '100%',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BFD9F5',
    backgroundColor: '#F2F8FF',
    padding: 14,
    alignItems: 'center',
  },
  payTitle: { fontSize: 15, fontWeight: '800', color: '#0B5CB8' },
  paySubtitle: { fontSize: 12, color: '#5a6b7d', marginTop: 2 },
  qrPress: { marginTop: 12, alignSelf: 'center', alignItems: 'center' },
  qr: {
    borderRadius: 10,
  },
  enlargeBadge: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  enlargeBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  qrOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    // Same solid blue as the GCash screenshot's own background, so the
    // picture melts into the screen with no black bands above/below it.
    backgroundColor: '#015BE5',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
  },
  qrOverlayHint: { color: '#fff', fontSize: 13, fontWeight: '600', marginBottom: 12 },
  qrCloseBtn: {
    marginTop: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 20,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  qrCloseText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  payAmount: { fontSize: 14, fontWeight: '700', color: '#1a1a1a', marginTop: 12 },
  payMeta: { fontSize: 12, color: '#444', marginTop: 3 },
  screenshotNote: {
    marginTop: 12,
    backgroundColor: '#FFF6DB',
    borderWidth: 1,
    borderColor: '#F3DC93',
    borderRadius: 10,
    padding: 10,
    width: '100%',
  },
  screenshotText: { fontSize: 12, color: '#6b5200', lineHeight: 17, textAlign: 'center' },
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
