import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';

export default function AdminAnalyticsScreen() {
  const { currentUser, isAdmin } = useAuth();
  const analyticsQuery = trpc.admin.analytics.useQuery(
    { adminUserId: currentUser?.id || '' },
    { enabled: Boolean(isAdmin && currentUser?.id) }
  );

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  if (analyticsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.dark.primary} />
      </SafeAreaView>
    );
  }

  if (analyticsQuery.error || !analyticsQuery.data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Failed to load analytics.</Text>
      </SafeAreaView>
    );
  }

  const data = analyticsQuery.data;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Program Analytics</Text>
        <View style={styles.card}>
          <Text style={styles.label}>Total submissions</Text>
          <Text style={styles.value}>{data.totalSubmissions}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Approval rate</Text>
          <Text style={styles.value}>{(data.approvalRate * 100).toFixed(1)}%</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Average score</Text>
          <Text style={styles.value}>{data.averageScore.toFixed(1)}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.label}>Avg impressions</Text>
          <Text style={styles.value}>{Math.round(data.engagementAverages.impressions)}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    padding: 20,
    paddingBottom: 36,
    gap: 12,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  label: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  value: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: '700',
    marginTop: 4,
  },
  error: {
    color: Colors.dark.error,
    padding: 20,
    fontSize: 15,
  },
});
