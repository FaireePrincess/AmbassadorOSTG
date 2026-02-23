import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import Colors from '@/constants/colors';
import Typography from '@/constants/typography';
import PressableScale from '@/components/PressableScale';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: React.ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
}

export default function AppButton({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  disabled = false,
  style,
}: AppButtonProps) {
  return (
    <PressableScale
      style={[
        styles.base,
        size === 'sm' ? styles.small : styles.medium,
        variant === 'primary' && styles.primary,
        variant === 'secondary' && styles.secondary,
        variant === 'ghost' && styles.ghost,
        variant === 'danger' && styles.danger,
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        style={[
          styles.label,
          variant === 'primary' && styles.primaryLabel,
          variant === 'secondary' && styles.secondaryLabel,
          variant === 'ghost' && styles.ghostLabel,
          variant === 'danger' && styles.dangerLabel,
        ]}
      >
        {label}
      </Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  small: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  medium: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primary: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  secondary: {
    backgroundColor: Colors.dark.surface,
    borderColor: Colors.dark.border,
  },
  ghost: {
    backgroundColor: Colors.dark.primary + '12',
    borderColor: Colors.dark.primary,
  },
  danger: {
    backgroundColor: Colors.dark.error + '18',
    borderColor: Colors.dark.error + '90',
  },
  disabled: {
    opacity: 0.65,
  },
  icon: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: Typography.sizes.body,
    fontWeight: Typography.weights.semibold,
  },
  primaryLabel: {
    color: '#fff',
  },
  secondaryLabel: {
    color: Colors.dark.text,
  },
  ghostLabel: {
    color: Colors.dark.primary,
  },
  dangerLabel: {
    color: Colors.dark.error,
  },
});
