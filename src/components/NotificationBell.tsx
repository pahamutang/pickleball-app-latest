import React, { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';
import { useAccountNotifications } from '../context/AccountNotificationsContext';

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// Messenger-style: a bell with a small red circular badge showing the
// unseen count. Tapping it opens a small anchored list (not a full-screen
// modal) of recent new accounts and marks them seen, which clears the
// badge. Owner-only — see where this gets rendered in BookingScreen and
// HomeScreen (both gated on `isOwner`).
export default function NotificationBell() {
  const { unseenCount, notifications, markAllSeen } = useAccountNotifications();
  const [open, setOpen] = useState(false);

  const badgeLabel = unseenCount > 9 ? '9+' : `${unseenCount}`;

  return (
    <>
      <Pressable
        onPress={() => {
          setOpen(true);
          markAllSeen();
        }}
        hitSlop={10}
        style={styles.bellWrap}
        accessibilityLabel={unseenCount > 0 ? `${unseenCount} new accounts` : 'Notifications'}
        accessibilityRole="button"
      >
        <Text style={styles.bellIcon}>🔔</Text>
        {unseenCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* A plain View here would let taps on the panel's own padding
              or title bubble up to the backdrop's onPress above and close
              the panel — Pressable (even with no-op onPress) absorbs the
              touch instead, so only an actual backdrop tap dismisses it. */}
          <Pressable style={styles.panel} onPress={() => {}}>
            <Text style={styles.panelTitle}>New Accounts</Text>
            {notifications.length === 0 ? (
              <Text style={styles.emptyText}>No new accounts yet.</Text>
            ) : (
              <FlatList
                data={notifications}
                keyExtractor={(n) => n.id}
                style={styles.list}
                renderItem={({ item }) => (
                  <View style={styles.row}>
                    <Text style={styles.rowName} numberOfLines={1}>
                      {item.displayName || 'New player'}
                    </Text>
                    <Text style={styles.rowTime}>{timeAgo(item.createdAt)}</Text>
                  </View>
                )}
              />
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellWrap: { position: 'relative', padding: 4 },
  bellIcon: { fontSize: 20 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: AppColors.crimsonRed,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1,
    borderColor: AppColors.forestGreen,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
  },
  panel: {
    marginTop: 70,
    marginRight: 12,
    width: 240,
    backgroundColor: AppColors.white,
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  panelTitle: { fontWeight: '700', fontSize: 14, color: '#222', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 12 },
  list: { maxHeight: 280 },
  row: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
  },
  rowName: { fontSize: 13, fontWeight: '600', color: '#222' },
  rowTime: { fontSize: 11, color: '#999', marginTop: 1 },
});
