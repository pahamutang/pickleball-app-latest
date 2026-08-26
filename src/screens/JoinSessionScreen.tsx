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
import { generateId } from '../types';

// Replaces the old code-based ClaimPlayerScreen. No code, no owner
// involvement — a player just types their name and adds themselves to the
// session. Their new row is linked to their own account (linked_user_id)
// right away, so the very next screen is their live bill.
export default function JoinSessionScreen({ onJoined }: { onJoined: () => void }) {
  const { signOut, session } = useAuth();
  const [name, setName] = useState('');
  const [fee, setFee] = useState('100');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleJoin = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Enter your name.');
      return;
    }
    const trimmedFee = fee.trim();
    // Court fee is optional — someone who's only ordering food/drinks and
    // not playing can leave it blank, which is treated as ₱0.
    const feeValue = trimmedFee === '' ? 0 : parseFloat(trimmedFee);
    if (isNaN(feeValue) || feeValue < 0) {
      setError('Enter a valid court fee, or leave it blank for ₱0.');
      return;
    }
    if (!session) {
      setError('You need to be signed in to join.');
      return;
    }

    setError(null);
    setSubmitting(true);
    const { error: insertError } = await supabase.from('players').insert({
      id: generateId(),
      name: trimmedName,
      court_fee: feeValue,
      court_fee_paid: false,
      linked_user_id: session.user.id,
    });
    setSubmitting(false);

    if (insertError) {
      console.warn('Failed to join session', insertError);
      setError('Something went wrong. Please try again.');
      return;
    }
    onJoined();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Join the session</Text>
      <Text style={styles.body}>
        Add yourself so you can see your own bill update live. The owner can still adjust it
        any time — you just can't mark things paid yourself.
      </Text>

      <Text style={styles.label}>Your name</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={(t) => {
          setName(t);
          if (error) setError(null);
        }}
        placeholder="e.g. Juan"
        autoFocus
      />

      <Text style={styles.label}>Court fee (₱)</Text>
      <TextInput
        style={styles.input}
        value={fee}
        onChangeText={(t) => {
          setFee(t);
          if (error) setError(null);
        }}
        keyboardType="decimal-pad"
        placeholder="Leave blank if just ordering"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        onPress={handleJoin}
        disabled={submitting}
        style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
      >
        {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Join</Text>}
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
  label: { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
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
