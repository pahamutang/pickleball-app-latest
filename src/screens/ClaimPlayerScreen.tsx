import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppColors } from '../colors';
import { supabase } from '../services/supabaseClient';
import { useAuth } from '../context/AuthContext';

export default function ClaimPlayerScreen({ onClaimed }: { onClaimed: () => void }) {
  const { signOut } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleClaim = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError('Enter the code the owner gave you.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('claim_player', { code: trimmed });
    setSubmitting(false);
    if (rpcError) {
      setError('Something went wrong. Please try again.');
      return;
    }
    if (!data) {
      setError('That code was not found, or has already been used.');
      return;
    }
    onClaimed();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Link your account</Text>
      <Text style={styles.body}>
        Ask the venue owner for your session code and enter it below. This links your app to
        your own bill — you'll see what you've ordered and what you owe, but only the owner can
        mark things as paid.
      </Text>

      <TextInput
        style={styles.input}
        value={code}
        onChangeText={(t) => {
          setCode(t.toUpperCase());
          if (error) setError(null);
        }}
        placeholder="e.g. 7F3K2A"
        autoCapitalize="characters"
        maxLength={6}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        onPress={handleClaim}
        disabled={submitting}
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Link Account</Text>}
      </Pressable>

      <Pressable onPress={signOut} style={styles.signOutBtn}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: AppColors.background, padding: 24, justifyContent: 'center' },
  title: { fontSize: 22, fontWeight: 'bold', color: '#1a1a1a', marginBottom: 10, textAlign: 'center' },
  body: { fontSize: 14, color: '#555', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
    fontSize: 20,
    textAlign: 'center',
    letterSpacing: 4,
    backgroundColor: '#fff',
  },
  error: { color: AppColors.crimsonRed, fontSize: 13, marginTop: 10, textAlign: 'center' },
  submitBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  signOutBtn: { marginTop: 18, alignItems: 'center' },
  signOutText: { color: '#888', fontSize: 13 },
});
