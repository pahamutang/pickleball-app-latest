import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppColors } from '../colors';
import { formatCurrency } from '../utils/currency';

// Common PHP cash denominations — tapping adds to the current amount,
// like tapping bills onto a counter one at a time.
const DENOMINATIONS = [20, 50, 100, 200, 500, 1000];

export default function PaymentCalculatorModal({
  visible,
  amountDue,
  playerName,
  alreadyPaidSomething = false,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  amountDue: number;
  playerName: string;
  // True if this player already has something paid on their tab — either
  // from an earlier partial cash collection, or a PAID chip tapped by
  // hand. When true, a ₱0 attempt here is still just "still owed", never
  // "failed" — failed implies nothing has ever been collected from them.
  alreadyPaidSomething?: boolean;
  onCancel: () => void;
  onConfirm: (received: number) => void;
}) {
  const [receivedText, setReceivedText] = useState('');
  const received = parseFloat(receivedText) || 0;
  const change = received - amountDue;
  const isEnough = received >= amountDue;
  // A short payment isn't a dead end — it's either "they gave something but
  // not quite enough / owner has no change yet" (pending), or "they didn't
  // bring any money at all / forgot" (failed). Either way it's still worth
  // logging, not just silently cancelled. But if they already have
  // something paid on their tab, it's never "failed" — just still short.
  const gaveNothing = received <= 0 && !alreadyPaidSomething;

  useEffect(() => {
    if (visible) setReceivedText('');
  }, [visible]);

  const addBill = (amount: number) => {
    const next = received + amount;
    // Keep centavos intact (e.g. 532.50 + 20 must stay 552.50, not round to
    // 553) — only trim a trailing ".00", never a real fractional amount.
    const text = next.toFixed(2);
    setReceivedText(text.endsWith('.00') ? text.slice(0, -3) : text);
  };

  const setExact = () => setReceivedText(amountDue.toFixed(2));
  const clear = () => setReceivedText('');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>Collect Payment — {playerName}</Text>

          <View style={styles.dueBox}>
            <Text style={styles.dueLabel}>Amount Due</Text>
            <Text style={styles.dueValue}>{formatCurrency(amountDue)}</Text>
          </View>

          <Text style={styles.label}>Cash Received</Text>
          <View style={styles.inputRow}>
            <Text style={styles.prefix}>₱</Text>
            <TextInput
              style={styles.input}
              value={receivedText}
              onChangeText={setReceivedText}
              keyboardType="decimal-pad"
              placeholder="0"
            />
            <Pressable onPress={clear} style={styles.clearBtn} accessibilityLabel="Clear amount" accessibilityRole="button">
              <Text style={styles.clearIcon}>⌫</Text>
            </Pressable>
          </View>

          <View style={styles.billsWrap}>
            {DENOMINATIONS.map((d) => (
              <Pressable key={d} style={styles.billBtn} onPress={() => addBill(d)}>
                <Text style={styles.billText}>+₱{d}</Text>
              </Pressable>
            ))}
            <Pressable style={[styles.billBtn, styles.exactBtn]} onPress={setExact}>
              <Text style={[styles.billText, { color: AppColors.forestGreen }]}>Exact</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.changeBox,
              {
                backgroundColor: isEnough ? AppColors.paidColor + '1F' : AppColors.unpaidColor + '1A',
                borderColor: isEnough ? AppColors.paidColor : AppColors.unpaidColor,
              },
            ]}
          >
            <Text
              style={[
                styles.changeLabel,
                { color: isEnough ? AppColors.paidColor : AppColors.unpaidColor },
              ]}
            >
              {isEnough ? 'CHANGE' : gaveNothing ? 'NOTHING COLLECTED YET' : 'STILL SHORT BY'}
            </Text>
            <Text
              style={[
                styles.changeValue,
                { color: isEnough ? AppColors.paidColor : AppColors.unpaidColor },
              ]}
            >
              {formatCurrency(Math.abs(change))}
            </Text>
          </View>

          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.textBtn}>
              <Text style={styles.textBtnLabel}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onConfirm(received)}
              style={[
                styles.filledBtn,
                !isEnough && !gaveNothing && styles.filledBtnPending,
                !isEnough && gaveNothing && styles.filledBtnFailed,
              ]}
            >
              <Text style={styles.filledBtnLabel}>
                {isEnough ? 'Confirm Payment' : gaveNothing ? 'Mark as Failed' : 'Log as Pending'}
              </Text>
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
  title: { fontSize: 17, fontWeight: 'bold', marginBottom: 14, color: '#1a1a1a' },
  dueBox: {
    backgroundColor: AppColors.forestGreen + '14',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  dueLabel: { fontSize: 12, color: '#777' },
  dueValue: { fontSize: 24, fontWeight: 'bold', color: AppColors.forestGreen, marginTop: 2 },
  label: { fontSize: 12, color: '#666', marginTop: 14, marginBottom: 4 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  prefix: { fontSize: 15, color: '#666', marginRight: 4 },
  input: { flex: 1, paddingVertical: 10, fontSize: 16 },
  clearBtn: { padding: 6 },
  clearIcon: { fontSize: 16, color: '#888' },
  billsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  billBtn: {
    borderWidth: 1,
    borderColor: '#999',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  exactBtn: { borderColor: AppColors.forestGreen },
  billText: { fontSize: 13, fontWeight: '600', color: '#333' },
  changeBox: {
    marginTop: 16,
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    alignItems: 'center',
  },
  changeLabel: { fontSize: 12, fontWeight: 'bold' },
  changeValue: { fontSize: 26, fontWeight: 'bold', marginTop: 2 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, gap: 12 },
  textBtn: { paddingVertical: 10, paddingHorizontal: 8 },
  textBtnLabel: { color: AppColors.forestGreen, fontWeight: '600' },
  filledBtn: {
    backgroundColor: AppColors.forestGreen,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  filledBtnPending: { backgroundColor: AppColors.unpaidColor },
  filledBtnFailed: { backgroundColor: AppColors.crimsonRed },
  filledBtnLabel: { color: '#fff', fontWeight: '600' },
});
