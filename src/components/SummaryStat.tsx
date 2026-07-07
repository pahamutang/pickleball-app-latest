import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function SummaryStat({
  label,
  value,
  valueColor = '#fff',
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.container}>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  value: { fontWeight: 'bold', fontSize: 16 },
  label: { color: 'rgba(255,255,255,0.7)', fontSize: 11 },
});
