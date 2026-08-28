import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppColors } from '../colors';
import { useAuth } from '../context/AuthContext';
import { MT_PICKLE_LOGO_BASE64 } from '../services/mtPickleLogoBase64';

type Mode = 'signIn' | 'signUp';

export default function AuthScreen() {
  const { signIn, signUp, claimOwnerRole } = useAuth();
  const [mode, setMode] = useState<Mode>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showOwnerPin, setShowOwnerPin] = useState(false);
  const [ownerPin, setOwnerPin] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    if (!email.trim() || !password.trim() || (mode === 'signUp' && !displayName.trim())) {
      setError('Please fill in all fields.');
      return;
    }
    setSubmitting(true);
    try {
      const errMsg =
        mode === 'signIn'
          ? await signIn(email.trim(), password)
          : await signUp(email.trim(), password, displayName.trim());

      if (errMsg) {
        setError(errMsg);
        setSubmitting(false);
        return;
      }

      if (mode === 'signUp' && showOwnerPin && ownerPin.trim()) {
        const ok = await claimOwnerRole(ownerPin.trim());
        if (!ok) {
          setError('Account created, but that owner PIN was incorrect. You were signed up as a player.');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Image source={{ uri: MT_PICKLE_LOGO_BASE64 }} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Mt Pickle Park</Text>
        <Text style={styles.subtitle}>
          {mode === 'signIn' ? 'Sign in to your account' : 'Create an account'}
        </Text>

        <View style={styles.card}>
          {mode === 'signUp' && (
            <>
              <Text style={styles.label}>Your name</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="e.g. Juan"
              />
            </>
          )}

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <Text style={styles.label}>Password</Text>
          <View style={styles.passwordRow} collapsable={false}>
            <TextInput
              style={[styles.input, styles.passwordInput]}
              value={password}
              onChangeText={setPassword}
              placeholder="At least 6 characters"
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoComplete="off"
              importantForAutofill="no"
            />
            <Pressable onPress={() => setShowPassword((v) => !v)} style={styles.showPasswordBtn}>
              <Text style={styles.showPasswordText}>{showPassword ? 'Hide' : 'Show'}</Text>
            </Pressable>
          </View>

          {mode === 'signUp' && (
            <>
              <Pressable onPress={() => setShowOwnerPin((v) => !v)} style={styles.ownerToggle}>
                <Text style={styles.ownerToggleText}>
                  {showOwnerPin ? '▾' : '▸'} I'm the owner (have a PIN)
                </Text>
              </Pressable>
              {showOwnerPin && (
                <TextInput
                  style={styles.input}
                  value={ownerPin}
                  onChangeText={setOwnerPin}
                  placeholder="Owner PIN"
                  secureTextEntry
                />
              )}
            </>
          )}

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleSubmit}
            disabled={submitting}
            style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>{mode === 'signIn' ? 'Sign In' : 'Sign Up'}</Text>
            )}
          </Pressable>

          <Pressable
            onPress={() => {
              setMode(mode === 'signIn' ? 'signUp' : 'signIn');
              setError(null);
            }}
            style={styles.switchBtn}
          >
            <Text style={styles.switchText}>
              {mode === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: AppColors.forestGreen },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { width: 88, height: 88, marginBottom: 12, borderRadius: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginBottom: 4 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 24 },
  card: { width: '100%', maxWidth: 360, backgroundColor: '#fff', borderRadius: 16, padding: 20 },
  label: { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
  },
  passwordInput: {
    flex: 1,
    borderWidth: 0,
  },
  showPasswordBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  showPasswordText: {
    color: AppColors.forestGreen,
    fontSize: 13,
    fontWeight: '600',
  },
  ownerToggle: { marginTop: 14 },
  ownerToggleText: { color: AppColors.forestGreen, fontWeight: '600', fontSize: 13 },
  error: { color: AppColors.crimsonRed, fontSize: 13, marginTop: 12 },
  submitBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 18,
  },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  switchBtn: { marginTop: 14, alignItems: 'center' },
  switchText: { color: AppColors.navy, fontSize: 13 },
});
