import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Path, Polyline, Stop } from 'react-native-svg';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import PressableScale from '@/components/PressableScale';

type WindowKey = '7d' | '30d' | '90d' | 'all';

const WINDOWS: Array<{ key: WindowKey; label: string; days: number | null }> = [
  { key: '7d', label: '7D', days: 7 },
  { key: '30d', label: '30D', days: 30 },
  { key: '90d', label: '90D', days: 90 },
  { key: 'all', label: 'ALL', days: null },
];

function formatValue(value: number): string {
  return value.toLocaleString();
}

function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toString();
}

function getDateRangeStart(windowKey: WindowKey): Date | null {
  const windowConfig = WINDOWS.find((item) => item.key === windowKey);
  if (!windowConfig?.days) return null;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (windowConfig.days - 1));
  return start;
}

function parseDateInput(value: string): Date | null {
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const date = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function TrendChart({ points }: { points: number[] }) {
  if (!points.length) {
    return (
      <View style={styles.chartEmpty}>
        <Text style={styles.chartEmptyText}>No trend data yet.</Text>
      </View>
    );
  }

  const width = 360;
  const height = 150;
  const maxValue = Math.max(...points, 1);
  const minValue = Math.min(...points, 0);
  const range = Math.max(1, maxValue - minValue);
  const spacing = points.length > 1 ? width / (points.length - 1) : width;

  const linePoints = points
    .map((value, index) => {
      const x = spacing * index;
      const y = height - ((value - minValue) / range) * height;
      return `${x},${Math.max(4, Math.min(height - 4, y))}`;
    })
    .join(' ');

  const areaPoints = `${linePoints} ${width},${height} 0,${height}`;

  return (
    <View style={styles.chartWrap}>
      <Svg width="100%" height={160} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <LinearGradient id="area" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={Colors.dark.primary} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={Colors.dark.primary} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={`M ${areaPoints}`} fill="url(#area)" />
        <Polyline points={linePoints} fill="none" stroke={Colors.dark.primary} strokeWidth={3} />
      </Svg>
    </View>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export default function AdminRegionalAnalyticsScreen() {
  const { users, isLoading: authLoading } = useAuth();
  const { submissions, isLoading: appLoading } = useApp();
  const [selectedRegion, setSelectedRegion] = useState<string>('All Regions');
  const [selectedWindow, setSelectedWindow] = useState<WindowKey>('30d');
  const [customStartInput, setCustomStartInput] = useState('');
  const [customEndInput, setCustomEndInput] = useState('');

  if (authLoading || appLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator color={Colors.dark.primary} />
      </SafeAreaView>
    );
  }

  const activeUsers = users.filter((user) => user.status === 'active');

  const regions = ['All Regions', ...new Set(activeUsers.map((user) => user.region || 'Unknown'))];
  const regionByUserId = new Map(activeUsers.map((user) => [user.id, user.region || 'Unknown']));
  const nameByUserId = new Map(activeUsers.map((user) => [user.id, user.name]));
  const presetStartDate = getDateRangeStart(selectedWindow);
  const customStartDate = parseDateInput(customStartInput);
  const customEndDate = parseDateInput(customEndInput);

  const hasCustomRange = Boolean(customStartDate && customEndDate && customStartDate <= customEndDate);
  const startDate = hasCustomRange ? customStartDate : presetStartDate;
  const endDate = hasCustomRange ? customEndDate : null;

  const approvedSubmissions = submissions.filter((submission) => {
    if (submission.status !== 'approved') return false;

    const region = regionByUserId.get(submission.userId) || 'Unknown';
    if (selectedRegion !== 'All Regions' && region !== selectedRegion) return false;

    if (!startDate) return true;
    const submittedAt = new Date(submission.submittedAt);
    if (Number.isNaN(submittedAt.getTime())) return false;
    if (submittedAt < startDate) return false;
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      if (submittedAt > endOfDay) return false;
    }
    return true;
  });

  const totals = approvedSubmissions.reduce(
    (acc, submission) => {
      acc.impressions += submission.metrics?.impressions || 0;
      acc.likes += submission.metrics?.likes || 0;
      acc.retweets += submission.metrics?.shares || 0;
      acc.posts += 1;
      return acc;
    },
    { impressions: 0, likes: 0, retweets: 0, posts: 0 }
  );

  const ambassadorsInScope = activeUsers.filter(
    (user) => selectedRegion === 'All Regions' || user.region === selectedRegion
  );
  const totalFollowers = ambassadorsInScope.reduce((sum, user) => sum + (user.stats?.xFollowers || 0), 0);

  const avgImpressionsPerPost = totals.posts > 0 ? Math.round(totals.impressions / totals.posts) : 0;
  const engagementRate = totals.impressions > 0 ? ((totals.likes + totals.retweets) / totals.impressions) * 100 : 0;

  const byUser = new Map<string, { posts: number; impressions: number; likes: number; retweets: number }>();
  for (const submission of approvedSubmissions) {
    const entry = byUser.get(submission.userId) || { posts: 0, impressions: 0, likes: 0, retweets: 0 };
    entry.posts += 1;
    entry.impressions += submission.metrics?.impressions || 0;
    entry.likes += submission.metrics?.likes || 0;
    entry.retweets += submission.metrics?.shares || 0;
    byUser.set(submission.userId, entry);
  }

  const topAmbassadors = [...byUser.entries()]
    .map(([userId, metrics]) => ({
      userId,
      name: nameByUserId.get(userId) || 'Unknown',
      ...metrics,
    }))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 8);

  const days = selectedWindow === 'all' ? 14 : WINDOWS.find((item) => item.key === selectedWindow)?.days || 14;
  const trendStart = new Date();
  trendStart.setHours(0, 0, 0, 0);
  trendStart.setDate(trendStart.getDate() - (days - 1));

  const dayMap = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const day = new Date(trendStart);
    day.setDate(trendStart.getDate() + i);
    dayMap.set(day.toISOString().slice(0, 10), 0);
  }

  for (const submission of approvedSubmissions) {
    const date = new Date(submission.submittedAt);
    if (Number.isNaN(date.getTime())) continue;
    const key = date.toISOString().slice(0, 10);
    if (!dayMap.has(key)) continue;
    dayMap.set(key, (dayMap.get(key) || 0) + (submission.metrics?.impressions || 0));
  }

  const trendValues = [...dayMap.values()];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Regional Performance Dashboard</Text>

        <View style={styles.windowRow}>
          {WINDOWS.map((windowItem) => {
            const active = selectedWindow === windowItem.key;
            return (
              <PressableScale
                key={windowItem.key}
                style={[styles.windowChip, active && styles.windowChipActive]}
                onPress={() => setSelectedWindow(windowItem.key)}
              >
                <Text style={[styles.windowChipText, active && styles.windowChipTextActive]}>{windowItem.label}</Text>
              </PressableScale>
            );
          })}
        </View>
        <View style={styles.dateInputRow}>
          <TextInput
            value={customStartInput}
            onChangeText={setCustomStartInput}
            placeholder="Start YYYY-MM-DD"
            placeholderTextColor={Colors.dark.textMuted}
            style={styles.dateInput}
            autoCapitalize="none"
          />
          <TextInput
            value={customEndInput}
            onChangeText={setCustomEndInput}
            placeholder="End YYYY-MM-DD"
            placeholderTextColor={Colors.dark.textMuted}
            style={styles.dateInput}
            autoCapitalize="none"
          />
        </View>
        <Text style={styles.dateHint}>
          {hasCustomRange ? 'Using custom date range.' : 'Using preset window. Enter both dates to override.'}
        </Text>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionRow}>
          {regions.map((region) => {
            const active = selectedRegion === region;
            return (
              <PressableScale
                key={region}
                style={[styles.regionChip, active && styles.regionChipActive]}
                onPress={() => setSelectedRegion(region)}
              >
                <Text style={[styles.regionChipText, active && styles.regionChipTextActive]}>{region}</Text>
              </PressableScale>
            );
          })}
        </ScrollView>

        <View style={styles.metricsGrid}>
          <MetricCard label="Impressions" value={formatValue(totals.impressions)} />
          <MetricCard label="Retweets" value={formatValue(totals.retweets)} />
          <MetricCard label="Likes" value={formatValue(totals.likes)} />
          <MetricCard label="Followers" value={formatValue(totalFollowers)} />
          <MetricCard label="Avg Imp / Post" value={formatValue(avgImpressionsPerPost)} />
          <MetricCard label="Engagement Rate" value={`${engagementRate.toFixed(2)}%`} />
        </View>

        <View style={styles.panel}>
          <Text style={styles.panelTitle}>Impressions Trend</Text>
          <TrendChart points={trendValues} />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>Ambassador Breakdown</Text>
            <Text style={styles.panelMeta}>
              {ambassadorsInScope.length} ambassadors • {formatCompact(totals.posts)} posts
            </Text>
          </View>
          {topAmbassadors.length === 0 ? (
            <Text style={styles.emptyText}>No approved submissions yet for this view.</Text>
          ) : (
            <View style={styles.tableWrap}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeadText, styles.nameCol]}>Ambassador</Text>
                <Text style={styles.tableHeadText}>Posts</Text>
                <Text style={styles.tableHeadText}>Imp.</Text>
                <Text style={styles.tableHeadText}>Likes</Text>
                <Text style={styles.tableHeadText}>RT</Text>
              </View>
              {topAmbassadors.map((ambassador) => (
                <View key={ambassador.userId} style={styles.tableRow}>
                  <Text style={[styles.tableCellText, styles.nameCol]} numberOfLines={1}>{ambassador.name}</Text>
                  <Text style={styles.tableCellText}>{ambassador.posts}</Text>
                  <Text style={styles.tableCellText}>{formatCompact(ambassador.impressions)}</Text>
                  <Text style={styles.tableCellText}>{formatCompact(ambassador.likes)}</Text>
                  <Text style={styles.tableCellText}>{formatCompact(ambassador.retweets)}</Text>
                </View>
              ))}
            </View>
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
    padding: 16,
    paddingBottom: 36,
    gap: 12,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 2,
  },
  windowRow: {
    flexDirection: 'row',
    gap: 8,
  },
  windowChip: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  windowChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: '#251d3f',
  },
  windowChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  windowChipTextActive: {
    color: Colors.dark.primaryLight,
  },
  dateInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dateInput: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    color: Colors.dark.text,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 13,
    fontWeight: '500',
  },
  dateHint: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    marginTop: -4,
  },
  regionRow: {
    gap: 8,
    paddingRight: 10,
  },
  regionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  regionChipActive: {
    borderColor: Colors.dark.secondary,
    backgroundColor: '#153642',
  },
  regionChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  regionChipTextActive: {
    color: Colors.dark.secondaryLight,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricCard: {
    width: '48%',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  metricLabel: {
    color: '#c084fc',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    fontSize: 11,
    fontWeight: '600',
  },
  metricValue: {
    marginTop: 5,
    color: Colors.dark.text,
    fontSize: 26,
    fontWeight: '700',
  },
  panel: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 12,
    gap: 8,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  panelTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
  },
  panelMeta: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  chartWrap: {
    width: '100%',
    height: 160,
    justifyContent: 'center',
  },
  chartEmpty: {
    height: 160,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.card,
  },
  chartEmptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
  tableWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.card,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  tableHeadText: {
    flex: 1,
    color: Colors.dark.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  tableCellText: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '600',
  },
  nameCol: {
    flex: 2,
  },
  emptyText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    paddingVertical: 4,
  },
  error: {
    color: Colors.dark.error,
    padding: 20,
    fontSize: 15,
  },
});
