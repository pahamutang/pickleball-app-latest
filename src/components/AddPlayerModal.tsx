import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppColors } from '../colors';
import { Player, generateId } from '../types';

export default function AddPlayerModal({
  visible,
  onCancel,
  onSubmit,
}: {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (player: Player) => void;
}) {
  const [name, setName] = useState('');
  const [fee, setFee] = useState('100');
  const [nameError, setNameError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setFee('100');
    setNameError(null);
    setFeeError(null);
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const trimmedFee = fee.trim();
    // Court fee is optional — a player who's only ordering food/drinks and
    // not playing can leave it blank, which is treated as ₱0.
    const feeValue = trimmedFee === '' ? 0 : parseFloat(trimmedFee);

    const hasNameError = !trimmedName;
    const hasFeeError = isNaN(feeValue) || feeValue < 0;

    setNameError(hasNameError ? 'Enter a name' : null);
    setFeeError(hasFeeError ? 'Enter a valid amount, or leave blank for ₱0' : null);

    if (hasNameError || hasFeeError) {
      return;
    }

    onSubmit({
      id: generateId(),
      name: trimmedName,
      courtFee: feeValue,
      courtFeePaid: false,
      orders: [],
    });
    reset();
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Add Player</Text>

          <Text style={styles.label}>Player name</Text>
          <TextInput
            style={[styles.input, nameError && styles.inputError]}
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError(null);
            }}
            autoFocus
            placeholder="e.g. Juan"
          />
          {nameError && <Text style={styles.error}>{nameError}</Text>}

          <Text style={styles.label}>Court fee (₱)</Text>
          <TextInput
            style={[styles.input, feeError && styles.inputError]}
            value={fee}
            onChangeText={(text) => {
              setFee(text);
              if (feeError) setFeeError(null);
            }}
            keyboardType="decimal-pad"
            placeholder="Leave blank if just ordering"
          />
          {feeError && <Text style={styles.error}>{feeError}</Text>}

          <View style={styles.actions}>
            <Pressable onPress={handleCancel} style={styles.textBtn}>
              <Text style={styles.textBtnLabel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSubmit} style={styles.filledBtn}>
              <Text style={styles.filledBtnLabel}>Add</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  dialog: { backgroundColor: '#fff', borderRadius: 14, padding: 20 },
  title: { fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#1a1a1a' },
  label: { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  inputError: { borderColor: AppColors.crimsonRed },
  error: { color: AppColors.crimsonRed, fontSize: 12, marginTop: 4 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 12 },
  textBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  textBtnLabel: { color: AppColors.forestGreen, fontWeight: '600' },
  filledBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  filledBtnLabel: { color: '#fff', fontWeight: '600' },
});
