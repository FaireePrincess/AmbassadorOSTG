import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3,
  CalendarRange,
  CircleGauge,
  Clock3,
  ChevronDown,
  ChevronUp,
  Layers3,
  Sparkles,
  TrendingUp,
} from 'lucide-react-native';
import Colors from '@/constants/colors';
import Typography from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import { trpc, trpcClient } from '@/lib/trpc';
import AppBackButton from '@/components/AppBackButton';
import PressableScale from '@/components/PressableScale';

type AnalyticsCampaign = {
  campaignId: string;
  campaignTitle: string;
  tasks: number;
  submissions: number;
  approvedSubmissions: number;
  approvalRate: number;
  completionRate: number | null;
  averageScore: number;
  totalImpressions: number;
  averageImpressions: number;
  submissionsPerPlatform: Record<string, number>;
  latestActivityAt?: string;
};

type AnalyticsResponse = {
  season: {
    id: string;
    name: string;
    number: number;
    status: 'active' | 'closed';
    startedAt: string;
    endedAt?: string;
    isCurrent: boolean;
    referenceWeekKey: string;
    totalTasks: number;
    scopedTaskCount: number;
    totalApprovedSubmissions: number;
  };
  volume: {
    totalSubmissions: number;
    submissionsPerPlatform: Record<string, number>;
    submissionsPerRegion: Record<string, number>;
    activeAmbassadorsThisWeek: number;
    inactiveAmbassadors: number;
  };
  quality: {
    approvalRate: number;
    averageContentScore: number;
    scoreDistribution20: Record<string, number>;
    topBottomSpread: number;
  };
  engagement: {
    totalImpressions: number;
    averageImpressionsPerSubmission: number;
    averageImpressionsPerRegion: Record<string, number>;
    distributionCurve: Record<string, number>;
  };
  extraContent?: {
    totalSubmissions: number;
    totalImpressions: number;
    averageImpressionsPerSubmission: number;
    submissionsPerRegion: Record<string, number>;
  };
  speed: {
    averageReviewTimeHours: number;
    averageTimeToSubmissionHours: number;
    taskCompletionRate: number;
  };
  campaigns: AnalyticsCampaign[];
};

export default function AdminAnalyticsScreen() {
  const router = useRouter();
  const { currentUser, isAdmin } = useAuth();
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | undefined>(undefined);
  const [expandedCampaignIds, setExpandedCampaignIds] = useState<string[]>([]);

  const seasonsQuery = trpc.seasons.list.useQuery(undefined, {
    enabled: Boolean(isAdmin && currentUser?.id),
  });
  const analyticsQuery = useQuery({
    queryKey: ['admin-analytics-rest', currentUser?.id || '', selectedSeasonId || 'current'],
    enabled: Boolean(isAdmin && currentUser?.id),
    queryFn: async () => {
      return trpcClient.admin.analytics.query({
        adminUserId: currentUser!.id,
        seasonId: selectedSeasonId,
      }) as Promise<AnalyticsResponse>;
    },
  });
  const seasons = seasonsQuery.data || [];

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>Admin access required.</Text>
      </SafeAreaView>
    );
  }

  if (analyticsQuery.isLoading || seasonsQuery.isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.dark.primary} />
      </SafeAreaView>
    );
  }

  if (analyticsQuery.error || !analyticsQuery.data) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.error}>{analyticsQuery.error instanceof Error ? analyticsQuery.error.message : 'Failed to load analytics.'}</Text>
      </SafeAreaView>
    );
  }

  const data = analyticsQuery.data;
  const season = data.season;
  const volume = data.volume;
  const quality = data.quality;
  const engagement = data.engagement;
  const extraContent = data.extraContent;
  const speed = data.speed;
  const campaigns = data.campaigns.slice(0, 10);

  const toggleCampaign = (campaignId: string) => {
    setExpandedCampaignIds((prev) =>
      prev.includes(campaignId) ? prev.filter((id) => id !== campaignId) : [...prev, campaignId]
    );
  };

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
          <Text style={styles.subtitle}>Season-aware reporting with campaign results and historical review.</Text>
        </View>

        {extraContent ? (
          <View style={styles.sectionCard}>
            <View style={styles.sectionHeader}>
              <LinearGradient colors={['#10b981', '#14b8a6']} style={styles.iconWrap}>
                <TrendingUp size={18} color="#fff" />
              </LinearGradient>
              <View style={styles.sectionHeaderBody}>
                <Text style={styles.sectionTitle}>Extra X Content</Text>
                <Text style={styles.sectionSubtitle}>Unscored reach tracking, separate from leaderboard calculations.</Text>
              </View>
            </View>
            <View style={styles.metricsGrid}>
              <MetricTile label="Extra posts" value={formatInteger(extraContent.totalSubmissions)} />
              <MetricTile label="Extra impressions" value={formatInteger(extraContent.totalImpressions)} />
              <MetricTile label="Avg impressions / extra post" value={formatInteger(extraContent.averageImpressionsPerSubmission)} />
            </View>
            <MetricList label="Extra posts per region" values={extraContent.submissionsPerRegion} />
          </View>
        ) : null}

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={['#34d399', '#10b981']} style={styles.iconWrap}>
              <CalendarRange size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.sectionHeaderBody}>
              <Text style={styles.sectionTitle}>Season Scope</Text>
              <Text style={styles.sectionSubtitle}>Switch between the live season and closed seasons without resetting history.</Text>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.seasonTabs}>
            <PressableScale
              style={[styles.seasonChip, !selectedSeasonId && styles.seasonChipActive]}
              onPress={() => setSelectedSeasonId(undefined)}
              hapticType="selection"
            >
              <Text style={[styles.seasonChipText, !selectedSeasonId && styles.seasonChipTextActive]}>
                Current
              </Text>
            </PressableScale>
            {seasons.map((item) => {
              const active = season.id === item.id;
              return (
                <PressableScale
                  key={item.id}
                  style={[styles.seasonChip, active && styles.seasonChipActive]}
                  onPress={() => setSelectedSeasonId(item.id)}
                  hapticType="selection"
                >
                  <Text style={[styles.seasonChipText, active && styles.seasonChipTextActive]}>
                    {item.name}
                  </Text>
                </PressableScale>
              );
            })}
          </ScrollView>

          <View style={styles.metricsGrid}>
            <MetricTile label="Selected season" value={season.name} />
            <MetricTile label="Status" value={season.status === 'active' ? 'Active' : 'Closed'} />
            <MetricTile label="Tasks in season" value={formatInteger(season.totalTasks)} />
            <MetricTile label="Approved submissions" value={formatInteger(season.totalApprovedSubmissions)} />
          </View>
          <Text style={styles.scopeMeta}>
            {formatSeasonRange(season.startedAt, season.endedAt)} • {season.isCurrent ? 'Current live season' : 'Historical season view'}
          </Text>
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
            <MetricTile label="Active ambassadors (latest week)" value={formatInteger(volume.activeAmbassadorsThisWeek)} />
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

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LinearGradient colors={['#38bdf8', '#6366f1']} style={styles.iconWrap}>
              <Layers3 size={18} color="#fff" />
            </LinearGradient>
            <View style={styles.sectionHeaderBody}>
              <Text style={styles.sectionTitle}>Campaign Results</Text>
              <Text style={styles.sectionSubtitle}>Latest 10 campaigns by activity. Tap a row to expand details.</Text>
            </View>
          </View>

          {campaigns.length === 0 ? (
            <Text style={styles.emptyText}>No campaign data found for this season.</Text>
          ) : (
            <View style={styles.campaignList}>
              {campaigns.map((campaign) => {
                const campaignKey = `${campaign.campaignId}:${campaign.campaignTitle}`;
                const isExpanded = expandedCampaignIds.includes(campaignKey);
                return (
                <PressableScale key={campaignKey} style={styles.campaignCard} onPress={() => toggleCampaign(campaignKey)} hapticType="selection">
                  <View style={styles.campaignHeader}>
                    <View style={styles.campaignHeaderBody}>
                      <Text style={styles.campaignTitle}>{campaign.campaignTitle}</Text>
                      <Text style={styles.campaignDate}>
                        Latest activity: {formatDate(campaign.latestActivityAt)}
                      </Text>
                    </View>
                    <View style={styles.campaignHeaderSide}>
                      <Text style={styles.campaignMeta}>{formatCompletion(campaign.completionRate)}</Text>
                      {isExpanded
                        ? <ChevronUp size={18} color={Colors.dark.textSecondary} />
                        : <ChevronDown size={18} color={Colors.dark.textSecondary} />}
                    </View>
                  </View>
                  {isExpanded && (
                    <>
                      <View style={styles.campaignStatsGrid}>
                        <CampaignStat label="Tasks" value={formatInteger(campaign.tasks)} />
                        <CampaignStat label="Submissions" value={formatInteger(campaign.submissions)} />
                        <CampaignStat label="Approved" value={formatInteger(campaign.approvedSubmissions)} />
                        <CampaignStat label="Approval" value={formatPercent(campaign.approvalRate)} />
                        <CampaignStat label="Avg score" value={campaign.averageScore.toFixed(1)} />
                        <CampaignStat label="Impressions" value={formatInteger(campaign.totalImpressions)} />
                      </View>
                      <MetricList label="Submissions per platform" values={campaign.submissionsPerPlatform} compact />
                    </>
                  )}
                </PressableScale>
              )})}
            </View>
          )}
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

function formatSeasonRange(startedAt?: string, endedAt?: string): string {
  const start = formatDate(startedAt);
  const end = endedAt ? formatDate(endedAt) : 'Live now';
  return `${start} -> ${end}`;
}

function formatDate(value?: string): string {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Unknown';
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatCompletion(value: number | null): string {
  if (value === null) return 'N/A';
  return `${formatPercent(value)} completion`;
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

function CampaignStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.campaignStat}>
      <Text style={styles.campaignStatLabel}>{label}</Text>
      <Text style={styles.campaignStatValue}>{value}</Text>
    </View>
  );
}

function MetricList({ label, values, compact = false }: { label: string; values?: Record<string, number>; compact?: boolean }) {
  const entries = Object.entries(values || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;

  return (
    <View style={[styles.listBlock, compact && styles.listBlockCompact]}>
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
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#262b3a',
    padding: 18,
    gap: 14,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeaderBody: {
    flex: 1,
    gap: 2,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.h3,
    fontWeight: Typography.weights.bold,
  },
  sectionSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
    lineHeight: 18,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricTile: {
    minWidth: '47%',
    flexGrow: 1,
    backgroundColor: '#10131b',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#23283a',
    paddingVertical: 14,
    paddingHorizontal: 14,
    gap: 6,
  },
  metricLabel: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.caption,
  },
  metricValue: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.h3,
    fontWeight: Typography.weights.bold,
  },
  listBlock: {
    gap: 10,
  },
  listBlockCompact: {
    gap: 8,
  },
  listTitle: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.body,
    fontWeight: Typography.weights.semibold,
  },
  listGrid: {
    gap: 8,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#10131b',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#23283a',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  listKey: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.body,
  },
  listValue: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.body,
    fontWeight: Typography.weights.semibold,
  },
  distributionWrap: {
    gap: 10,
  },
  distributionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  distributionLabel: {
    width: 68,
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
  },
  distributionTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    backgroundColor: '#10131b',
    overflow: 'hidden',
  },
  distributionFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: Colors.dark.primary,
  },
  distributionCount: {
    width: 30,
    textAlign: 'right',
    color: Colors.dark.text,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.semibold,
  },
  seasonTabs: {
    gap: 8,
    paddingRight: 12,
  },
  seasonChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2b3144',
    backgroundColor: '#10131b',
  },
  seasonChipActive: {
    backgroundColor: '#173522',
    borderColor: '#2fbf71',
  },
  seasonChipText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.medium,
  },
  seasonChipTextActive: {
    color: '#dffbea',
    fontWeight: Typography.weights.semibold,
  },
  scopeMeta: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
    lineHeight: 18,
  },
  campaignList: {
    gap: 12,
  },
  campaignCard: {
    backgroundColor: '#10131b',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#23283a',
    padding: 14,
    gap: 12,
  },
  campaignHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  campaignHeaderBody: {
    flex: 1,
    gap: 4,
  },
  campaignHeaderSide: {
    alignItems: 'flex-end',
    gap: 8,
  },
  campaignTitle: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: Typography.sizes.h3,
    fontWeight: Typography.weights.bold,
  },
  campaignDate: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.caption,
  },
  campaignMeta: {
    color: Colors.dark.secondaryLight,
    fontSize: Typography.sizes.caption,
    fontWeight: Typography.weights.semibold,
  },
  campaignStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  campaignStat: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: '#171924',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  campaignStatLabel: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.caption,
  },
  campaignStatValue: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.body,
    fontWeight: Typography.weights.bold,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.body,
    lineHeight: 20,
  },
  error: {
    color: Colors.dark.error,
    textAlign: 'center',
    marginTop: 24,
  },
});
