import React from 'react';
import { StyleSheet, Text, ViewStyle } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import Colors from '@/constants/colors';
import PressableScale from '@/components/PressableScale';
import Typography from '@/constants/typography';

interface AppBackButtonProps {
  onPress: () => void;
  label?: string;
  style?: ViewStyle;
}

export default function AppBackButton({ onPress, label = 'Back', style }: AppBackButtonProps) {
  return (
    <PressableScale style={[styles.button, style]} onPress={onPress}>
      <ChevronLeft size={16} color={Colors.dark.text} />
      <Text style={styles.label}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  label: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.bold,
  },
});
