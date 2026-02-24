import React from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import {
  BarChart3,
  CircleGauge,
  Clock3,
  Sparkles,
  TrendingUp,
} from 'lucide-react-native';
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
  const volume = data.volume;
  const quality = data.quality;
  const engagement = data.engagement;
  const speed = data.speed;

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#05070d', '#090b12', '#0d0d12']} style={styles.gradientBg} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <AppBackButton onPress={() => router.back()} />
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Sparkles size={14} color={Colors.dark.secondary} />
            <Text style={styles.headerBadgeText}>Metrics Lab</Text>
          </View>
          <Text style={styles.title}>Program Analytics</Text>
          <Text style={styles.subtitle}>Volume, quality, engagement, and speed in one view.</Text>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={['#a78bfa', '#7c3aed']} style={styles.iconWrap}>
              <BarChart3 size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.sectionHeaderBody}>
              <Text style={styles.sectionTitle}>Volume</Text>
              <Text style={styles.sectionSubtitle}>How much content is being produced and where.</Text>
            </View>
          </View>
          <View style={styles.metricsGrid}>
            <MetricTile label="Total submissions" value={formatInteger(volume.totalSubmissions)} />
            <MetricTile label="Active ambassadors (week)" value={formatInteger(volume.activeAmbassadorsThisWeek)} />
            <MetricTile label="Inactive ambassadors" value={formatInteger(volume.inactiveAmbassadors)} />
          </View>
          <MetricList label="Submissions per platform" values={volume.submissionsPerPlatform} />
          <MetricList label="Submissions per region" values={volume.submissionsPerRegion} />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={['#22d3ee', '#2563eb']} style={styles.iconWrap}>
              <CircleGauge size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.sectionHeaderBody}>
              <Text style={styles.sectionTitle}>Quality</Text>
              <Text style={styles.sectionSubtitle}>Submission acceptance and score spread.</Text>
            </View>
          </View>
          <View style={styles.metricsGrid}>
            <MetricTile label="Approval rate" value={formatPercent(quality.approvalRate)} />
            <MetricTile label="Average content score" value={quality.averageContentScore.toFixed(1)} />
            <MetricTile label="Top 10% vs bottom 10%" value={`${quality.topBottomSpread.toFixed(1)} spread`} />
          </View>
          <DistributionList title="Score distribution (0-5-10-15-20)" values={quality.scoreDistribution20} />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={['#06b6d4', '#3b82f6']} style={styles.iconWrap}>
              <TrendingUp size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.sectionHeaderBody}>
              <Text style={styles.sectionTitle}>Engagement</Text>
              <Text style={styles.sectionSubtitle}>Impressions and engagement distribution.</Text>
            </View>
          </View>
          <View style={styles.metricsGrid}>
            <MetricTile label="Total impressions" value={formatInteger(engagement.totalImpressions)} />
            <MetricTile label="Avg impressions / submission" value={formatInteger(engagement.averageImpressionsPerSubmission)} />
          </View>
          <MetricList label="Avg impressions per region" values={engagement.averageImpressionsPerRegion} />
          <DistributionList title="Engagement distribution curve" values={engagement.distributionCurve} />
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={['#ec4899', '#f59e0b']} style={styles.iconWrap}>
              <Clock3 size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.sectionHeaderBody}>
              <Text style={styles.sectionTitle}>Speed</Text>
              <Text style={styles.sectionSubtitle}>Operational cycle time and throughput.</Text>
            </View>
          </View>
          <View style={styles.metricsGrid}>
            <MetricTile label="Avg review time" value={formatHours(speed.averageReviewTimeHours)} />
            <MetricTile label="Avg time to submission" value={formatHours(speed.averageTimeToSubmissionHours)} />
            <MetricTile label="Task completion rate" value={formatPercent(speed.taskCompletionRate)} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function formatInteger(value: number): string {
  return Math.round(value || 0).toLocaleString();
}

function formatPercent(value: number): string {
  return `${((value || 0) * 100).toFixed(1)}%`;
}

function formatHours(value: number): string {
  const hours = value || 0;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function MetricList({ label, values }: { label: string; values?: Record<string, number> }) {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <View style={styles.listBlock}>
      <Text style={styles.listTitle}>{label}</Text>
      <View style={styles.listGrid}>
        {entries.map(([key, value]) => (
          <View style={styles.listRow} key={key}>
            <Text style={styles.listKey} numberOfLines={1}>{key}</Text>
            <Text style={styles.listValue}>{formatInteger(value)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function DistributionList({ title, values }: { title: string; values?: Record<string, number> }) {
  const entries = Object.entries(values || {});
  const max = Math.max(1, ...entries.map(([, count]) => count));
  if (entries.length === 0) return null;

  return (
    <View style={styles.listBlock}>
      <Text style={styles.listTitle}>{title}</Text>
      <View style={styles.distributionWrap}>
        {entries.map(([bucket, count]) => (
          <View style={styles.distributionRow} key={bucket}>
            <Text style={styles.distributionLabel}>{bucket}</Text>
            <View style={styles.distributionTrack}>
              <View style={[styles.distributionFill, { width: `${(count / max) * 100}%` }]} />
            </View>
            <Text style={styles.distributionCount}>{count}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 36,
    gap: 14,
  },
  header: {
    gap: 8,
    paddingBottom: 4,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#0f1f2a',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1e3a4a',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  headerBadgeText: {
    color: Colors.dark.secondaryLight,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.semibold,
  },
  title: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.h1,
    fontWeight: Typography.weights.bold,
    letterSpacing: 0.4,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.body,
    lineHeight: 20,
  },
  sectionCard: {
    backgroundColor: '#171924',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24283a',
    padding: 12,
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderBody: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.title,
    fontWeight: Typography.weights.bold,
  },
  sectionSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.caption,
    lineHeight: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricTile: {
    minWidth: '48%',
    flexGrow: 1,
    backgroundColor: '#11131c',
    borderWidth: 1,
    borderColor: '#24283a',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 4,
  },
  metricLabel: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.caption,
  },
  metricValue: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: Typography.weights.bold,
  },
  listBlock: {
    gap: 6,
  },
  listTitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.semibold,
  },
  listGrid: {
    gap: 6,
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#11131c',
    borderWidth: 1,
    borderColor: '#24283a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  listKey: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: Typography.sizes.body,
  },
  listValue: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.body,
    fontWeight: Typography.weights.semibold,
  },
  distributionWrap: {
    gap: 7,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  distributionLabel: {
    width: 52,
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
  },
  distributionTrack: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: '#22263a',
  },
  distributionFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.dark.primary,
  },
  distributionCount: {
    width: 28,
    textAlign: 'right',
    color: Colors.dark.text,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.semibold,
  },
  error: {
    color: Colors.dark.error,
    padding: 20,
    fontSize: Typography.sizes.body,
  },
});
