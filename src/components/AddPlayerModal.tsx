import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppColors } from '../colors';
import { Player, generateId } from '../types';
import { supabase } from '../services/supabaseClient';

type AccountOption = { id: string; displayName: string };

export default function AddPlayerModal({
  visible,
  onCancel,
  onSubmit,
  existingPlayers,
}: {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (player: Player) => void;
  // Players already in this session — used to hide any signed-in account
  // that's already been added, so the owner can't pick the same person
  // twice and end up with two rows fighting over their one live bill.
  existingPlayers: Player[];
}) {
  const [name, setName] = useState('');
  const [fee, setFee] = useState('100');
  const [nameError, setNameError] = useState<string | null>(null);
  const [feeError, setFeeError] = useState<string | null>(null);
  // Set when the name currently in the field came from tapping a
  // signed-in account below, rather than being typed in as a walk-in.
  // This is what actually makes the fee show up live on that person's
  // phone — see PlayersContext/MyBillScreen, which key off it.
  const [linkedUserId, setLinkedUserId] = useState<string | undefined>(undefined);
  const [accounts, setAccounts] = useState<AccountOption[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(false);

  const reset = () => {
    setName('');
    setFee('100');
    setNameError(null);
    setFeeError(null);
    setLinkedUserId(undefined);
  };

  const alreadyAddedIds = new Set(
    existingPlayers.map((p) => p.linkedUserId).filter((id): id is string => !!id)
  );

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setAccountsLoading(true);
    supabase
      .from('profiles')
      .select('id, display_name')
      .eq('role', 'player')
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('Failed to load signed-in players', error);
          setAccounts([]);
        } else {
          setAccounts(
            (data ?? [])
              .filter((row) => !alreadyAddedIds.has(row.id))
              .map((row) => ({
                id: row.id,
                displayName: row.display_name?.trim() || 'Unnamed player',
              }))
          );
        }
        setAccountsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-run whenever the modal opens or the session's player list
    // changes, so someone just added disappears from this list right away.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, existingPlayers.length]);

  const selectAccount = (account: AccountOption) => {
    setLinkedUserId(account.id);
    setName(account.displayName);
    if (nameError) setNameError(null);
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
      linkedUserId,
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

          {(accountsLoading || accounts.length > 0) && (
            <View style={styles.accountsSection}>
              <Text style={styles.label}>Signed-in players</Text>
              {accountsLoading ? (
                <ActivityIndicator size="small" color={AppColors.forestGreen} />
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {accounts.map((account) => (
                    <Pressable
                      key={account.id}
                      onPress={() => selectAccount(account)}
                      style={[
                        styles.accountChip,
                        linkedUserId === account.id && styles.accountChipSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.accountChipText,
                          linkedUserId === account.id && styles.accountChipTextSelected,
                        ]}
                      >
                        {account.displayName}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              )}
              <Text style={styles.accountsHint}>
                {linkedUserId
                  ? "Fee will sync live to this player's own bill."
                  : 'Tap someone above, or type a walk-in name below (no live bill sync).'}
              </Text>
            </View>
          )}

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
  accountsSection: { marginTop: 4 },
  accountChip: {
    borderWidth: 1,
    borderColor: AppColors.forestGreen,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
  },
  accountChipSelected: { backgroundColor: AppColors.forestGreen },
  accountChipText: { color: AppColors.forestGreen, fontWeight: '600', fontSize: 13 },
  accountChipTextSelected: { color: '#fff' },
  accountsHint: { fontSize: 11, color: '#888', marginTop: 6 },
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
