import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Platform as PlatformType } from '@/types';
import Colors from '@/constants/colors';

interface PlatformBadgeProps {
  platform: PlatformType;
  size?: 'small' | 'medium';
}

const platformConfig: Record<PlatformType, { label: string; color: string }> = {
  twitter: { label: 'X', color: Colors.dark.twitter },
  instagram: { label: 'IG', color: Colors.dark.instagram },
  tiktok: { label: 'TT', color: '#00F2EA' },
  youtube: { label: 'YT', color: Colors.dark.youtube },
};

export default function PlatformBadge({ platform, size = 'small' }: PlatformBadgeProps) {
  const config = platformConfig[platform];
  const isSmall = size === 'small';

  return (
    <View style={[styles.badge, { backgroundColor: config.color }, isSmall && styles.badgeSmall]}>
      <Text style={[styles.text, isSmall && styles.textSmall]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeSmall: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  textSmall: {
    fontSize: 10,
  },
});
