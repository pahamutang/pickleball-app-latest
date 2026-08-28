import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { AppColors } from '../colors';
import { AccountNotification, useAccountNotifications } from '../context/AccountNotificationsContext';

// A small, non-blocking sign that slides down from the top — not a big
// popup, not a system push. Only ever shows while AccountNotificationsProvider
// is mounted, i.e. only while the owner has the app open. Auto-dismisses
// on its own; tapping it dismisses early.
export default function NewAccountToast() {
  const { toast, dismissToast } = useAccountNotifications();
  const translateY = useRef(new Animated.Value(-80)).current;
  // Keeps rendering the last toast's content while it slides back out —
  // `toast` itself flips to null (auto-dismiss or tap) the instant the
  // exit animation should *start*, not once it's finished. Returning
  // null as soon as `toast` is null would unmount the Animated.View
  // before the reverse animation ever got a frame to run, so it just
  // popped out of existence instead of sliding away.
  const [displayed, setDisplayed] = useState<AccountNotification | null>(null);

  useEffect(() => {
    if (toast) {
      setDisplayed(toast);
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8 }).start();
    } else if (displayed) {
      Animated.timing(translateY, { toValue: -80, duration: 200, useNativeDriver: true }).start(() => {
        setDisplayed(null);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast]);

  if (!displayed) return null;

  return (
    <Animated.View style={[styles.wrap, { transform: [{ translateY }] }]} pointerEvents="box-none">
      <Pressable style={styles.pill} onPress={dismissToast}>
        <Text style={styles.icon}>🔔</Text>
        <Text style={styles.text} numberOfLines={1}>
          {displayed.displayName || 'A new player'} just created an account
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 8,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.forestGreen,
    borderWidth: 1,
    borderColor: AppColors.gold,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  icon: { fontSize: 13, marginRight: 6 },
  text: { color: '#fff', fontSize: 12, fontWeight: '600' },
});
