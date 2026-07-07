import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppColors } from '../colors';
import { loadSettings, saveSettings } from '../services/settingsService';

export default function SettingsScreen({ onDone }: { onDone: () => void }) {
  const [sessionTitle, setSessionTitle] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSettings().then((s) => {
      setSessionTitle(s.sessionTitle);
      setOwnerEmail(s.ownerEmail);
      setLoading(false);
    });
  }, []);

  const handleSave = async () => {
    if (!sessionTitle.trim()) {
      setError('Session / court name is required');
      return;
    }
    if (!ownerEmail.includes('@')) {
      setError('Enter a valid owner email');
      return;
    }
    await saveSettings({ sessionTitle: sessionTitle.trim(), ownerEmail: ownerEmail.trim() });
    onDone();
  };

  if (loading) {
    return (
      <View style={styles.centerFill}>
        <ActivityIndicator color={AppColors.forestGreen} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable onPress={onDone} hitSlop={8}>
          <Text style={styles.backArrow}>←</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Receipt Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
      <Text style={styles.label}>Session / court name</Text>
<TextInput
  style={styles.input}
  value={sessionTitle}
  onChangeText={setSessionTitle}
  placeholder="e.g. Cebu Pickleball Club — Court 2"
/>

<Text style={styles.label}>Owner's email (receipt goes here)</Text>
<TextInput
  style={styles.input}
  value={ownerEmail}
  onChangeText={setOwnerEmail}
  keyboardType="email-address"
  autoCapitalize="none"
/>

{error && <Text style={styles.error}>{error}</Text>}

        <Pressable onPress={handleSave} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save Settings</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: AppColors.background },
  centerFill: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppColors.forestGreen,
    paddingTop: 54,
    paddingBottom: 16,
    paddingHorizontal: 16,
    gap: 14,
  },
  backArrow: { color: '#fff', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  body: { padding: 16, paddingBottom: 60 },
  helper: { color: '#777', fontSize: 13, lineHeight: 19, marginBottom: 18 },
  googleBox: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(11,48,31,0.08)',
  },
  signInBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    minWidth: 200,
    alignItems: 'center',
  },
  signInText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  signedInText: { color: '#777', fontSize: 12 },
  signedInEmail: { color: '#1a1a1a', fontWeight: '600', fontSize: 15, marginTop: 2 },
  signOutBtn: { marginTop: 10 },
  signOutText: { color: AppColors.crimsonRed, fontWeight: '600' },
  label: { fontSize: 12, color: '#666', marginTop: 8, marginBottom: 4 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: AppColors.crimsonRed, fontSize: 12, marginTop: 12 },
  saveBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
