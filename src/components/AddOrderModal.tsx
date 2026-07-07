import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppColors } from '../colors';
import { OrderItem, generateId } from '../types';

// Quick-add shortcuts for common pickleball canteen items.
const QUICK_ITEMS: [string, number][] = [
  ['Water', 20],
  ['Soda', 30],
  ['Isotonic drink', 40],
  ['Siomai', 35],
  ['Rice meal', 60],
];

export default function AddOrderModal({
  visible,
  onCancel,
  onSubmit,
  editingItem,
}: {
  visible: boolean;
  onCancel: () => void;
  onSubmit: (item: OrderItem) => void;
  // When set, the modal opens pre-filled with this order's values and
  // submits an update to the same item (same id/isPaid) instead of a new one.
  editingItem?: OrderItem | null;
}) {
  const isEditing = !!editingItem;
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('1');
  const [error, setError] = useState<string | null>(null);

  // Re-fill the form whenever the modal is opened, either blank (add) or
  // with the item being edited.
  React.useEffect(() => {
    if (!visible) return;
    if (editingItem) {
      setName(editingItem.name);
      setPrice(String(editingItem.price));
      setQty(String(editingItem.quantity));
    } else {
      setName('');
      setPrice('');
      setQty('1');
    }
    setError(null);
  }, [visible, editingItem]);

  const fillQuick = (itemName: string, itemPrice: number) => {
    setName(itemName);
    setPrice(itemPrice.toFixed(0));
  };

  const handleSubmit = () => {
    const trimmedName = name.trim();
    const priceValue = parseFloat(price.trim());
    const qtyValue = parseInt(qty.trim(), 10);

    if (!trimmedName) {
      setError('Enter item name');
      return;
    }
    if (isNaN(priceValue) || priceValue < 0) {
      setError('Enter a valid price');
      return;
    }
    if (isNaN(qtyValue) || qtyValue < 1) {
      setError('Enter a valid qty');
      return;
    }

    onSubmit({
      id: editingItem?.id ?? generateId(),
      name: trimmedName,
      price: priceValue,
      quantity: qtyValue,
      isPaid: editingItem?.isPaid ?? false,
    });
  };

  const handleCancel = () => {
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{isEditing ? 'Edit Order' : 'Add Order'}</Text>

          {!isEditing && (
            <View style={styles.chipsWrap}>
              {QUICK_ITEMS.map(([itemName, itemPrice]) => (
                <Pressable
                  key={itemName}
                  style={styles.chip}
                  onPress={() => fillQuick(itemName, itemPrice)}
                >
                  <Text style={styles.chipText}>{itemName}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.label}>Item name</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} />

          <Text style={styles.label}>Price (₱)</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Quantity</Text>
          <TextInput style={styles.input} value={qty} onChangeText={setQty} keyboardType="number-pad" />

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable onPress={handleCancel} style={styles.textBtn}>
              <Text style={styles.textBtnLabel}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleSubmit} style={styles.filledBtn}>
              <Text style={styles.filledBtnLabel}>{isEditing ? 'Save' : 'Add'}</Text>
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
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderWidth: 1,
    borderColor: AppColors.forestGreen,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: { color: AppColors.forestGreen, fontSize: 12, fontWeight: '600' },
  label: { fontSize: 12, color: '#666', marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  error: { color: AppColors.crimsonRed, fontSize: 12, marginTop: 8 },
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
