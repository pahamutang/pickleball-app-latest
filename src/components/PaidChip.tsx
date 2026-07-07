import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AppColors } from '../colors';

export default function PaidChip({ paid, onPress }: { paid: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: paid ? AppColors.paidColor : AppColors.unpaidColor },
      ]}
    >
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
