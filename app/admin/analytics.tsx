import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import Typography from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import AppBackButton from '@/components/AppBackButton';

export default function AdminAnalyticsScreen() {
  const router = useRouter();
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
        <AppBackButton onPress={() => router.back()} />
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
    fontSize: Typography.sizes.h2,
    fontWeight: Typography.weights.bold,
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
    fontSize: Typography.sizes.body,
  },
  value: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.h3,
    fontWeight: Typography.weights.bold,
    marginTop: 4,
  },
  error: {
    color: Colors.dark.error,
    padding: 20,
    fontSize: Typography.sizes.body,
  },
});
