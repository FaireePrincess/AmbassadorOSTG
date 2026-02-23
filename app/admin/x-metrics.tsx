import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { trpc } from '@/lib/trpc';
import PressableScale from '@/components/PressableScale';
import AppBackButton from '@/components/AppBackButton';

export default function AdminXMetricsScreen() {
  const router = useRouter();
  const { currentUser, isAdmin } = useAuth();
  const [selectedRegion, setSelectedRegion] = useState<string | null>(null);
  const [showUpdated, setShowUpdated] = useState(true);
  const [showErrors, setShowErrors] = useState(true);

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

  const regions = statusQuery.data?.regions || [];
  const effectiveRegion = selectedRegion || regions[0] || null;

  const filteredLogs = useMemo(() => {
    const logs = statusQuery.data?.logs || [];
    return logs.filter((entry) => {
      if (effectiveRegion && entry.region !== effectiveRegion) return false;
      if (!showUpdated && entry.type === 'updated') return false;
      if (!showErrors && entry.type === 'error') return false;
      return true;
    });
  }, [statusQuery.data?.logs, effectiveRegion, showUpdated, showErrors]);

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
          <AppBackButton onPress={() => router.back()} />
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
                runNowMutation.mutate({ adminUserId: currentUser.id, region: effectiveRegion || undefined });
              }}
              disabled={runNowMutation.isPending}
            >
              <Text style={styles.runBtnText}>{runNowMutation.isPending ? 'Running...' : `Run ${effectiveRegion || 'Now'}`}</Text>
            </PressableScale>
          </View>

          {statusQuery.isLoading ? (
            <ActivityIndicator color={Colors.dark.primary} />
          ) : statusQuery.data ? (
            <>
              <Text style={styles.line}>API: {statusQuery.data.configured ? 'Configured' : 'Missing TWITTER_BEARER_TOKEN'}</Text>
              <Text style={styles.line}>Running: {statusQuery.data.running ? 'Yes' : 'No'}</Text>
              <Text style={styles.line}>Last run: {statusQuery.data.lastRunAt ? new Date(statusQuery.data.lastRunAt).toLocaleString() : 'Never'}</Text>
              <Text style={styles.line}>Last region: {statusQuery.data.lastRegion || 'N/A'}</Text>
              <Text style={styles.line}>Last reason: {statusQuery.data.lastReason || 'N/A'}</Text>
              <Text style={styles.line}>Last batch: {statusQuery.data.lastProcessed || 0} processed, {statusQuery.data.lastErrors || 0} errors, {statusQuery.data.lastRemaining || 0} remaining</Text>
              <Text style={styles.line}>Last duration: {statusQuery.data.lastDurationMs ? `${Math.round(statusQuery.data.lastDurationMs / 1000)}s` : 'N/A'}</Text>
              <Text style={styles.line}>Next run: {statusQuery.data.nextScheduledRunAt ? new Date(statusQuery.data.nextScheduledRunAt).toLocaleString() : 'Pending'}</Text>
            </>
          ) : (
            <Text style={styles.error}>Unable to load status.</Text>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Regions</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionRow}>
            {regions.map((region) => {
              const active = region === effectiveRegion;
              const last = statusQuery.data?.regionLastRunAt?.[region];
              return (
                <PressableScale
                  key={region}
                  style={[styles.regionChip, active && styles.regionChipActive]}
                  onPress={() => setSelectedRegion(region)}
                >
                  <Text style={[styles.regionChipText, active && styles.regionChipTextActive]}>{region}</Text>
                  <Text style={styles.regionChipMeta}>{last ? new Date(last).toLocaleTimeString() : 'not run'}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>Run Logs (48h)</Text>
            <View style={styles.toggleRow}>
              <PressableScale
                style={[styles.toggleBtn, showUpdated && styles.toggleBtnActive]}
                onPress={() => setShowUpdated((prev) => !prev)}
              >
                <Text style={[styles.toggleText, showUpdated && styles.toggleTextActive]}>Updated</Text>
              </PressableScale>
              <PressableScale
                style={[styles.toggleBtn, showErrors && styles.toggleBtnActive]}
                onPress={() => setShowErrors((prev) => !prev)}
              >
                <Text style={[styles.toggleText, showErrors && styles.toggleTextActive]}>Errors</Text>
              </PressableScale>
            </View>
          </View>

          {filteredLogs.length === 0 ? (
            <Text style={styles.line}>No logs for this filter.</Text>
          ) : (
            filteredLogs.slice(0, 100).map((entry) => (
              <View key={entry.id} style={styles.logRow}>
                <Text style={[styles.logType, entry.type === 'updated' ? styles.logUpdated : styles.logError]}>
                  {entry.type.toUpperCase()}
                </Text>
                <Text style={styles.logMeta}>{entry.region} • {new Date(entry.timestamp).toLocaleString()}</Text>
                <Text style={styles.logMessage}>{entry.userName} • {entry.message}</Text>
                {entry.critical && <Text style={styles.logCritical}>Critical</Text>}
              </View>
            ))
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
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
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
    gap: 10,
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
  regionRow: {
    gap: 8,
  },
  regionChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 120,
  },
  regionChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  regionChipText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '700',
  },
  regionChipTextActive: {
    color: Colors.dark.primary,
  },
  regionChipMeta: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  toggleBtnActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  toggleText: {
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: '700',
  },
  toggleTextActive: {
    color: Colors.dark.primary,
  },
  logRow: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    backgroundColor: Colors.dark.surfaceLight,
    padding: 10,
    marginBottom: 8,
  },
  logType: {
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 3,
  },
  logUpdated: {
    color: Colors.dark.success,
  },
  logError: {
    color: Colors.dark.error,
  },
  logMeta: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginBottom: 4,
  },
  logMessage: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  logCritical: {
    marginTop: 4,
    color: Colors.dark.warning,
    fontSize: 11,
    fontWeight: '700',
  },
});
