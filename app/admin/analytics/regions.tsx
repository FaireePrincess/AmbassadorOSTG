import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';

export default function AdminRegionalAnalyticsScreen() {
  const { currentUser, isAdmin } = useAuth();
  const analyticsQuery = trpc.admin.analyticsRegions.useQuery(
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
        <Text style={styles.error}>Failed to load regional analytics.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Regional Analytics</Text>
        {analyticsQuery.data.map((region) => (
          <View key={region.region} style={styles.card}>
            <Text style={styles.region}>{region.region}</Text>
            <Text style={styles.metric}>Submissions: {region.submissions}</Text>
            <Text style={styles.metric}>Approval: {(region.approvalRate * 100).toFixed(1)}%</Text>
            <Text style={styles.metric}>Avg Score: {region.averageScore.toFixed(1)}</Text>
          </View>
        ))}
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
  region: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  metric: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  error: {
    color: Colors.dark.error,
    padding: 20,
    fontSize: 15,
  },
});
