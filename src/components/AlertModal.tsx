import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';

export type AlertVariant = 'error' | 'warning' | 'info' | 'success';

const VARIANT_STYLE: Record<
  AlertVariant,
  { icon: string; badgeBg: string; badgeBorder: string; buttonBg: string }
> = {
  error: { icon: '⚠️', badgeBg: '#FDECEC', badgeBorder: '#F8D2D2', buttonBg: AppColors.crimsonRed },
  warning: { icon: '⏳', badgeBg: '#FFF6DC', badgeBorder: '#FBE8A6', buttonBg: AppColors.forestGreen },
  info: { icon: 'ℹ️', badgeBg: '#EAF2FF', badgeBorder: '#CFE0FA', buttonBg: AppColors.forestGreen },
  success: { icon: '✅', badgeBg: '#E6F5EA', badgeBorder: '#BEE6C9', buttonBg: AppColors.forestGreen },
};

// Themed replacement for React Native's native Alert.alert — matches the
// brand look everywhere else in the app instead of dropping into a plain
// system dialog with white background and default system text.
export default function AlertModal({
  visible,
  variant = 'info',
  title,
  message,
  buttonLabel = 'Got it',
  onClose,
}: {
  visible: boolean;
  variant?: AlertVariant;
  title: string;
  message: string;
  buttonLabel?: string;
  onClose: () => void;
}) {
  const v = VARIANT_STYLE[variant];
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={[styles.iconBadge, { backgroundColor: v.badgeBg, borderColor: v.badgeBorder }]}>
            <Text style={styles.iconText}>{v.icon}</Text>
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          <Pressable
            onPress={onClose}
            style={[styles.button, { backgroundColor: v.buttonBg }]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonLabel}>{buttonLabel}</Text>
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
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },
  iconText: { fontSize: 26 },
  title: { fontSize: 18, fontWeight: '800', color: '#1a1a1a', textAlign: 'center' },
  message: { fontSize: 14, color: '#444', textAlign: 'center', marginTop: 10, lineHeight: 20 },
  button: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', width: '100%', marginTop: 20 },
  buttonLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
