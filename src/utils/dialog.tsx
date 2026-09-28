import React, { useEffect, useState } from 'react';
import { Alert as RNAlert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';

// WHY THIS EXISTS
// React Native's Alert.alert does nothing on the web build, and the
// browser's window.confirm() is blocked inside VS Code's Simple Browser
// (and some embedded browsers). Anything that waited for an "OK / Cancel"
// tap therefore looked like a dead button. This is a drop-in `Alert` that
// draws its own in-app dialog on web, and uses the normal native dialog
// on Android/iOS.

export type DialogButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type DialogState = { title: string; message?: string; buttons: DialogButton[] };

let pushDialog: ((d: DialogState) => void) | null = null;

export const Alert = {
  alert(title: string, message?: string, buttons?: DialogButton[]) {
    if (Platform.OS !== 'web') {
      RNAlert.alert(title, message, buttons as any);
      return;
    }
    const dialog: DialogState = {
      title,
      message,
      buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
    };
    if (pushDialog) {
      pushDialog(dialog);
    } else {
      console.warn('DialogHost is not mounted; dialog dropped:', title, message);
    }
  },
};

// Mount once near the root of the app (see App.tsx).
export function DialogHost() {
  const [queue, setQueue] = useState<DialogState[]>([]);

  useEffect(() => {
    pushDialog = (d) => setQueue((q) => [...q, d]);
    return () => {
      pushDialog = null;
    };
  }, []);

  const current = queue[0];
  if (!current) return null;

  const close = (button?: DialogButton) => {
    setQueue((q) => q.slice(1));
    button?.onPress?.();
  };

  const cancelButton = current.buttons.find((b) => b.style === 'cancel');

  // Deliberately NOT a react-native <Modal>: on some web setups (embedded
  // browsers, portals) a Modal can fail to appear or fail to receive taps.
  // A plain fixed-position overlay always renders wherever the app does.
  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => close(cancelButton)} />
      <View style={styles.dialog}>
        <Text style={styles.title}>{current.title}</Text>
        {!!current.message && <Text style={styles.message}>{current.message}</Text>}
        <View style={styles.actions}>
          {current.buttons.map((b, i) => (
            <Pressable
              key={`${b.text}-${i}`}
              onPress={() => close(b)}
              accessibilityRole="button"
              style={[
                styles.button,
                b.style === 'destructive' && styles.buttonDestructive,
                b.style === 'cancel' && styles.buttonCancel,
                (!b.style || b.style === 'default') && styles.buttonDefault,
              ]}
            >
              <Text style={[styles.buttonText, b.style === 'cancel' && styles.buttonTextCancel]}>
                {b.text}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed' as any,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  title: { fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 8 },
  message: { fontSize: 14, color: '#555', lineHeight: 20, marginBottom: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
  button: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  buttonDefault: { backgroundColor: AppColors.forestGreen },
  buttonDestructive: { backgroundColor: AppColors.crimsonRed },
  buttonCancel: { backgroundColor: '#EEEEEE' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  buttonTextCancel: { color: '#333' },
});
