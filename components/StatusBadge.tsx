import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SubmissionStatus, TaskStatus } from '@/types';
import Colors from '@/constants/colors';

interface StatusBadgeProps {
  status: SubmissionStatus | TaskStatus;
}

const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
  pending: { label: 'Pending', bg: Colors.dark.warning + '20', text: Colors.dark.warning },
  approved: { label: 'Approved', bg: Colors.dark.success + '20', text: Colors.dark.success },
  needs_edits: { label: 'Needs Edits', bg: Colors.dark.accent + '20', text: Colors.dark.accent },
  rejected: { label: 'Rejected', bg: Colors.dark.error + '20', text: Colors.dark.error },
  active: { label: 'Active', bg: Colors.dark.success + '20', text: Colors.dark.success },
  upcoming: { label: 'Upcoming', bg: Colors.dark.secondary + '20', text: Colors.dark.secondary },
  completed: { label: 'Completed', bg: Colors.dark.textMuted + '20', text: Colors.dark.textMuted },
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.pending;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
  },
});
