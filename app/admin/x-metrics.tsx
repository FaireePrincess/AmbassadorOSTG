import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import PressableScale from '@/components/PressableScale';

export default function AdminXMetricsScreen() {
  const router = useRouter();
  const { currentUser, isAdmin } = useAuth();

  const statusQuery = trpc.admin.xMetricsStatus.useQuery(
    { adminUserId: currentUser?.id || '' },
    { enabled: Boolean(isAdmin && currentUser?.id), refetchInterval: 30000 }
  );

  const runNowMutation = trpc.admin.runXMetricsNow.useMutation({
    onSuccess: () => {
      void statusQuery.refetch();
    },
    onError: (error) => {
      Alert.alert('X Metrics', error.message || 'Failed to run job');
    },
  });

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <PressableScale style={styles.backBtn} onPress={() => router.back()}>
            <Text style={styles.backBtnText}>Back</Text>
          </PressableScale>
          <Text style={styles.title}>X Metrics</Text>
          <View style={{ width: 52 }} />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Tracker Status</Text>
            <PressableScale
              style={[styles.runBtn, runNowMutation.isPending && styles.runBtnDisabled]}
              onPress={() => {
                if (!currentUser?.id) return;
                runNowMutation.mutate({ adminUserId: currentUser.id });
              }}
              disabled={runNowMutation.isPending}
            >
              <Text style={styles.runBtnText}>{runNowMutation.isPending ? 'Running...' : 'Run Now'}</Text>
            </PressableScale>
          </View>

          {statusQuery.isLoading ? (
            <ActivityIndicator color={Colors.dark.primary} />
          ) : statusQuery.data ? (
            <>
              <Text style={styles.line}>API: {statusQuery.data.configured ? 'Configured' : 'Missing TWITTER_BEARER_TOKEN'}</Text>
              <Text style={styles.line}>Running: {statusQuery.data.running ? 'Yes' : 'No'}</Text>
              <Text style={styles.line}>Last run: {statusQuery.data.lastRunAt ? new Date(statusQuery.data.lastRunAt).toLocaleString() : 'Never'}</Text>
              <Text style={styles.line}>Last reason: {statusQuery.data.lastReason || 'N/A'}</Text>
              <Text style={styles.line}>Last batch: {statusQuery.data.lastProcessed || 0} processed, {statusQuery.data.lastErrors || 0} errors, {statusQuery.data.lastRemaining || 0} remaining</Text>
              <Text style={styles.line}>Last duration: {statusQuery.data.lastDurationMs ? `${Math.round(statusQuery.data.lastDurationMs / 1000)}s` : 'N/A'}</Text>
              <Text style={styles.line}>Next run: {statusQuery.data.nextScheduledRunAt ? new Date(statusQuery.data.nextScheduledRunAt).toLocaleString() : 'Pending'}</Text>
            </>
          ) : (
            <Text style={styles.error}>Unable to load status.</Text>
          )}
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
    paddingBottom: 40,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  backBtn: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  backBtnText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: '700',
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 14,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  cardTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
  },
  runBtn: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  runBtnDisabled: {
    opacity: 0.6,
  },
  runBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  line: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginBottom: 6,
  },
  error: {
    color: Colors.dark.error,
    fontSize: 13,
  },
});
