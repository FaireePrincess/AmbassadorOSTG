import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Colors from '@/constants/colors';

interface StatCardProps {
  label: string;
  value: string | number;
  color?: string;
  compact?: boolean;
}

export default function StatCard({ label, value, color = Colors.dark.primary, compact = false }: StatCardProps) {
  const formattedValue = typeof value === 'number' 
    ? value >= 1000000 
      ? (value / 1000000).toFixed(1) + 'M'
      : value >= 1000 
        ? (value / 1000).toFixed(1) + 'K'
        : value.toString()
    : value;

  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <Text style={[styles.value, { color }]}>{formattedValue}</Text>
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  cardCompact: {
    padding: 12,
  },
  value: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  label: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
