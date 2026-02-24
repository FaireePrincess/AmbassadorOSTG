import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Trophy, Globe2, BarChart3, X } from 'lucide-react-native';
import Colors from '@/constants/colors';
import Typography from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import PressableScale from '@/components/PressableScale';

const QUALITY_MAX = {
  relevanceToTask: 25,
  creativity: 15,
  originality: 15,
  effortFormat: 15,
  enthusiasmTone: 10,
} as const;

function formatWholePoints(value: number) {
  return Math.ceil(value).toLocaleString();
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const { users, currentUser } = useAuth();
  const { allSubmissions } = useApp();
  const [limit, setLimit] = useState<10 | 50>(10);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const canAccessRegionalDashboard = currentUser?.role === 'admin' || currentUser?.role === 'regional_lead';

  const overall = useMemo(() => {
    const active = users.filter((u) => u.status === 'active');
    return active
      .map((u) => ({
        id: u.id,
        name: u.name,
        username: u.username,
        handles: u.handles,
        stats: u.stats,
        region: u.region,
        points: u.points,
      }))
      .sort((a, b) => b.points - a.points)
      .map((u, idx) => ({ ...u, rank: idx + 1 }));
  }, [users]);

  const selectedUser = useMemo(
    () => overall.find((entry) => entry.id === selectedUserId) || null,
    [overall, selectedUserId]
  );
  const selectedSocialHandles = useMemo(() => {
    if (!selectedUser) return [];
    const handles = [
      { label: 'X', value: selectedUser.handles?.twitter },
      { label: 'Instagram', value: selectedUser.handles?.instagram },
      { label: 'TikTok', value: selectedUser.handles?.tiktok },
      { label: 'YouTube', value: selectedUser.handles?.youtube },
      { label: 'Facebook', value: selectedUser.handles?.facebook },
      { label: 'Telegram', value: selectedUser.handles?.telegram },
      { label: 'Discord', value: selectedUser.handles?.discord },
    ];
    return handles.filter((item) => (item.value || '').trim().length > 0);
  }, [selectedUser]);

  const selectedQuality = useMemo(() => {
    if (!selectedUser) {
      return {
        completedTasks: 0,
        relevanceToTask: { current: 0, max: 0 },
        creativity: { current: 0, max: 0 },
        originality: { current: 0, max: 0 },
        effortFormat: { current: 0, max: 0 },
        enthusiasmTone: { current: 0, max: 0 },
      };
    }

    const ratedApproved = allSubmissions.filter(
      (submission) =>
        submission.userId === selectedUser.id &&
        submission.status === 'approved' &&
        submission.rating
    );
    const completedTasks = ratedApproved.length;

    const totalByKey = {
      relevanceToTask: ratedApproved.reduce((sum, item) => sum + (item.rating?.relevanceToTask || 0), 0),
      creativity: ratedApproved.reduce((sum, item) => sum + (item.rating?.creativity || 0), 0),
      originality: ratedApproved.reduce((sum, item) => sum + (item.rating?.originality || 0), 0),
      effortFormat: ratedApproved.reduce((sum, item) => sum + (item.rating?.effortFormat || 0), 0),
      enthusiasmTone: ratedApproved.reduce((sum, item) => sum + (item.rating?.enthusiasmTone || 0), 0),
    };

    return {
      completedTasks,
      relevanceToTask: { current: totalByKey.relevanceToTask, max: completedTasks * QUALITY_MAX.relevanceToTask },
      creativity: { current: totalByKey.creativity, max: completedTasks * QUALITY_MAX.creativity },
      originality: { current: totalByKey.originality, max: completedTasks * QUALITY_MAX.originality },
      effortFormat: { current: totalByKey.effortFormat, max: completedTasks * QUALITY_MAX.effortFormat },
      enthusiasmTone: { current: totalByKey.enthusiasmTone, max: completedTasks * QUALITY_MAX.enthusiasmTone },
    };
  }, [allSubmissions, selectedUser]);

  const rows = overall.slice(0, limit);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>Leaderboard</Text>
          <Text style={styles.subtitle}>Overall rankings + regional views.</Text>
        </View>

        <View style={styles.quickRow}>
          <PressableScale style={styles.quickCard} onPress={() => router.push('/regional-leaderboard' as any)}>
            <Globe2 size={18} color={Colors.dark.secondary} />
            <Text style={styles.quickTitle}>Regional Leaderboard</Text>
            <Text style={styles.quickMeta}>View by region</Text>
          </PressableScale>
          {canAccessRegionalDashboard && (
            <PressableScale style={styles.quickCard} onPress={() => router.push('/admin/analytics/regions' as any)}>
              <BarChart3 size={18} color={Colors.dark.primary} />
              <Text style={styles.quickTitle}>Regional Dashboard</Text>
              <Text style={styles.quickMeta}>KPIs and trends</Text>
            </PressableScale>
          )}
        </View>

        <View style={styles.sectionHeader}>
          <View style={styles.sectionLeft}>
            <Trophy size={18} color={Colors.dark.warning} />
            <Text style={styles.sectionTitle}>Overall</Text>
          </View>
          <View style={styles.limitRow}>
            <PressableScale style={[styles.limitBtn, limit === 10 && styles.limitBtnActive]} onPress={() => setLimit(10)}>
              <Text style={[styles.limitBtnText, limit === 10 && styles.limitBtnTextActive]}>Top 10</Text>
            </PressableScale>
            <PressableScale style={[styles.limitBtn, limit === 50 && styles.limitBtnActive]} onPress={() => setLimit(50)}>
              <Text style={[styles.limitBtnText, limit === 50 && styles.limitBtnTextActive]}>Top 50</Text>
            </PressableScale>
          </View>
        </View>

        <View style={styles.listCard}>
          {rows.map((entry) => {
            const isCurrent = entry.id === currentUser?.id;
            return (
              <PressableScale key={entry.id} style={[styles.row, isCurrent && styles.rowCurrent]} onPress={() => setSelectedUserId(entry.id)}>
                <View style={styles.rankPill}>
                  <Text style={styles.rankText}>{entry.rank}</Text>
                </View>
                <View style={styles.userCol}>
                  <Text style={styles.name}>{entry.name}</Text>
                  <Text style={styles.region}>{entry.region}</Text>
                </View>
                <Text style={styles.points}>{formatWholePoints(entry.points)} pts</Text>
              </PressableScale>
            );
          })}
        </View>
      </ScrollView>

      <Modal
        visible={!!selectedUser}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedUserId(null)}
      >
        <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
          <View style={styles.modalHeader}>
            <PressableScale style={styles.modalIconBtn} onPress={() => setSelectedUserId(null)} testID="close-recap-modal">
              <X size={22} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Recap Card</Text>
            <View style={styles.modalIconBtnPlaceholder} />
          </View>

          {selectedUser && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.recapHero}>
                <Text style={styles.recapName}>{selectedUser.name}</Text>
                <Text style={styles.recapMeta}>{selectedUser.region} • @{selectedUser.username || 'not-set'}</Text>
              </View>

              <View style={styles.recapStatsRow}>
                <View style={styles.recapStatCard}>
                  <Text style={styles.recapStatValue}>{selectedUser.rank}</Text>
                  <Text style={styles.recapStatLabel}>Ranking</Text>
                </View>
                <View style={styles.recapStatCard}>
                  <Text style={styles.recapStatValue}>{formatWholePoints(selectedUser.points)}</Text>
                  <Text style={styles.recapStatLabel}>Points</Text>
                </View>
              </View>

              <View style={styles.recapPanel}>
                <Text style={styles.recapPanelTitle}>Tasks Completed</Text>
                <Text style={styles.recapCompletedValue}>{selectedQuality.completedTasks}</Text>
              </View>

              <View style={styles.recapPanel}>
                <Text style={styles.recapPanelTitle}>Content Quality and Execution</Text>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityLabel}>Relevance to Task</Text>
                  <Text style={styles.qualityValue}>{selectedQuality.relevanceToTask.current}/{selectedQuality.relevanceToTask.max}</Text>
                </View>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityLabel}>Creativity</Text>
                  <Text style={styles.qualityValue}>{selectedQuality.creativity.current}/{selectedQuality.creativity.max}</Text>
                </View>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityLabel}>Originality</Text>
                  <Text style={styles.qualityValue}>{selectedQuality.originality.current}/{selectedQuality.originality.max}</Text>
                </View>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityLabel}>Effort and Format</Text>
                  <Text style={styles.qualityValue}>{selectedQuality.effortFormat.current}/{selectedQuality.effortFormat.max}</Text>
                </View>
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityLabel}>Enthusiasm and Tone</Text>
                  <Text style={styles.qualityValue}>{selectedQuality.enthusiasmTone.current}/{selectedQuality.enthusiasmTone.max}</Text>
                </View>
              </View>

              <View style={styles.recapPanel}>
                <Text style={styles.recapPanelTitle}>X Stats</Text>
                <View style={styles.recapStatsRow}>
                  <View style={styles.recapMiniStat}>
                    <Text style={styles.recapMiniValue}>{selectedUser.stats.totalImpressions.toLocaleString()}</Text>
                    <Text style={styles.recapMiniLabel}>Impressions</Text>
                  </View>
                  <View style={styles.recapMiniStat}>
                    <Text style={styles.recapMiniValue}>{selectedUser.stats.totalLikes.toLocaleString()}</Text>
                    <Text style={styles.recapMiniLabel}>Likes</Text>
                  </View>
                </View>
              </View>

              {selectedSocialHandles.length > 0 && (
                <View style={styles.recapPanel}>
                  <Text style={styles.recapPanelTitle}>Social Accounts</Text>
                  {selectedSocialHandles.map((item) => (
                    <View key={item.label} style={styles.socialRow}>
                      <Text style={styles.socialLabel}>{item.label}</Text>
                      <Text style={styles.socialValue}>{item.value}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  header: { gap: 4 },
  title: { color: Colors.dark.text, fontSize: Typography.sizes.h1, fontWeight: Typography.weights.bold },
  subtitle: { color: Colors.dark.textSecondary, fontSize: Typography.sizes.body },
  quickRow: { flexDirection: 'row', gap: 10 },
  quickCard: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    padding: 12,
    gap: 6,
  },
  quickTitle: { color: Colors.dark.text, fontSize: Typography.sizes.body, fontWeight: Typography.weights.bold },
  quickMeta: { color: Colors.dark.textMuted, fontSize: Typography.sizes.caption },
  sectionHeader: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: Colors.dark.text, fontSize: Typography.sizes.h3, fontWeight: Typography.weights.bold },
  limitRow: { flexDirection: 'row', gap: 6 },
  limitBtn: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: Colors.dark.surface,
  },
  limitBtnActive: { borderColor: Colors.dark.primary, backgroundColor: Colors.dark.primary + '18' },
  limitBtnText: { color: Colors.dark.textSecondary, fontSize: Typography.sizes.caption, fontWeight: Typography.weights.semibold },
  limitBtnTextActive: { color: Colors.dark.primary },
  listCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  rowCurrent: { backgroundColor: Colors.dark.primary + '14' },
  rankPill: {
    minWidth: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.surfaceLight,
  },
  rankText: { color: Colors.dark.text, fontSize: Typography.sizes.caption, fontWeight: Typography.weights.bold },
  userCol: { flex: 1 },
  name: { color: Colors.dark.text, fontSize: Typography.sizes.body, fontWeight: Typography.weights.semibold },
  region: { color: Colors.dark.textMuted, fontSize: Typography.sizes.caption },
  points: { color: Colors.dark.warning, fontSize: Typography.sizes.body, fontWeight: Typography.weights.bold },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  modalIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalIconBtnPlaceholder: {
    width: 30,
    height: 30,
  },
  modalTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: '700',
  },
  modalContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  recapHero: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2e3350',
    backgroundColor: '#121427',
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  recapName: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: '700',
  },
  recapMeta: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  recapStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  recapStatCard: {
    flex: 1,
    minHeight: 76,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#25304a',
    backgroundColor: '#0e1320',
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recapStatValue: {
    color: Colors.dark.text,
    fontSize: 22,
    fontWeight: '800',
  },
  recapStatLabel: {
    color: '#7bf542',
    fontSize: 12,
    fontWeight: '700',
    marginTop: 4,
  },
  recapPanel: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  recapPanelTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  recapMiniStat: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: Colors.dark.card,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    padding: 10,
  },
  recapMiniValue: {
    color: Colors.dark.warning,
    fontSize: 16,
    fontWeight: '700',
  },
  recapMiniLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  recapCompletedValue: {
    color: Colors.dark.primary,
    fontSize: 22,
    fontWeight: '700',
  },
  qualityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 8,
    marginTop: 8,
  },
  qualityLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  qualityValue: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '700',
  },
  socialRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
    paddingTop: 8,
    marginTop: 8,
    gap: 10,
  },
  socialLabel: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  socialValue: {
    flex: 1,
    textAlign: 'right',
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '600',
  },
});
