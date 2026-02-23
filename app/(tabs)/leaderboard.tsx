import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Trophy, Globe2, BarChart3 } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import PressableScale from '@/components/PressableScale';

export default function LeaderboardScreen() {
  const router = useRouter();
  const { users, currentUser } = useAuth();
  const [limit, setLimit] = useState<10 | 50>(10);

  const overall = useMemo(() => {
    const active = users.filter((u) => u.status === 'active');
    return active
      .map((u) => ({
        id: u.id,
        name: u.name,
        region: u.region,
        points: u.points,
      }))
      .sort((a, b) => b.points - a.points)
      .map((u, idx) => ({ ...u, rank: idx + 1 }));
  }, [users]);

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
          <PressableScale style={styles.quickCard} onPress={() => router.push('/admin/analytics/regions' as any)}>
            <BarChart3 size={18} color={Colors.dark.primary} />
            <Text style={styles.quickTitle}>Regional Dashboard</Text>
            <Text style={styles.quickMeta}>KPIs and trends</Text>
          </PressableScale>
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
              <View key={entry.id} style={[styles.row, isCurrent && styles.rowCurrent]}>
                <View style={styles.rankPill}>
                  <Text style={styles.rankText}>{entry.rank}</Text>
                </View>
                <View style={styles.userCol}>
                  <Text style={styles.name}>{entry.name}</Text>
                  <Text style={styles.region}>{entry.region}</Text>
                </View>
                <Text style={styles.points}>{entry.points.toLocaleString()} pts</Text>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.dark.background },
  content: { padding: 16, paddingBottom: 36, gap: 12 },
  header: { gap: 4 },
  title: { color: Colors.dark.text, fontSize: 28, fontWeight: '800' },
  subtitle: { color: Colors.dark.textSecondary, fontSize: 13 },
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
  quickTitle: { color: Colors.dark.text, fontSize: 14, fontWeight: '700' },
  quickMeta: { color: Colors.dark.textMuted, fontSize: 12 },
  sectionHeader: { marginTop: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: Colors.dark.text, fontSize: 18, fontWeight: '700' },
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
  limitBtnText: { color: Colors.dark.textSecondary, fontSize: 12, fontWeight: '600' },
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
  rankText: { color: Colors.dark.text, fontSize: 12, fontWeight: '700' },
  userCol: { flex: 1 },
  name: { color: Colors.dark.text, fontSize: 14, fontWeight: '600' },
  region: { color: Colors.dark.textMuted, fontSize: 12 },
  points: { color: Colors.dark.warning, fontSize: 13, fontWeight: '700' },
});
