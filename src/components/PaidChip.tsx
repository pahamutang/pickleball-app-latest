import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppColors } from '../colors';

// When `onPress` is omitted the chip renders as a plain read-only badge —
// used for players, who can see paid/unpaid status but can't toggle it
// themselves (only the owner can mark something paid).
export default function PaidChip({ paid, onPress }: { paid: boolean; onPress?: () => void }) {
  const chipStyle = [
    styles.chip,
    { backgroundColor: paid ? AppColors.paidColor : AppColors.unpaidColor },
  ];
  if (!onPress) {
    return (
      <View style={chipStyle}>
        <Text style={styles.text}>{paid ? 'PAID' : 'UNPAID'}</Text>
      </View>
    );
  }
  return (
    <Pressable onPress={onPress} style={chipStyle}>
      <Text style={styles.text}>{paid ? 'PAID' : 'UNPAID'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  text: {
    color: '#fff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
