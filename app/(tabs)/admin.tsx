import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, FileCheck, BarChart3, Globe2, RadioTower, TimerReset, ChevronRight, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import PressableScale from '@/components/PressableScale';

type AdminItem = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  colors: [string, string];
  route: string;
};

const ADMIN_ITEMS: AdminItem[] = [
  {
    id: 'ambassadors',
    title: 'Ambassadors',
    subtitle: 'User management and account controls',
    icon: Users,
    colors: ['#f59e0b', '#fb7185'],
    route: '/admin/management',
  },
  {
    id: 'review',
    title: 'Review',
    subtitle: 'Moderate submissions and approve content',
    icon: FileCheck,
    colors: ['#22d3ee', '#2563eb'],
    route: '/(tabs)/submissions',
  },
  {
    id: 'program',
    title: 'Program Analytics',
    subtitle: 'Overall health and performance',
    icon: BarChart3,
    colors: ['#a78bfa', '#7c3aed'],
    route: '/admin/analytics',
  },
  {
    id: 'regional',
    title: 'Regional Dashboard',
    subtitle: 'Region filters, KPIs, and trends',
    icon: Globe2,
    colors: ['#06b6d4', '#3b82f6'],
    route: '/admin/analytics/regions',
  },
  {
    id: 'xmetrics',
    title: 'X Metrics',
    subtitle: 'Tracking runs and sync health',
    icon: RadioTower,
    colors: ['#ec4899', '#f59e0b'],
    route: '/admin/x-metrics',
  },
  {
    id: 'season',
    title: 'Season Control',
    subtitle: 'Close season and reset program state',
    icon: TimerReset,
    colors: ['#34d399', '#10b981'],
    route: '/admin/management?section=season',
  },
];

export default function AdminHubScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.blockedCard}>
          <Text style={styles.blockedTitle}>Admin access required</Text>
          <Text style={styles.blockedText}>This section is visible only to active admin accounts.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <LinearGradient colors={['#05070d', '#090b12', '#0d0d12']} style={styles.gradientBg} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <View style={styles.headerBadge}>
            <Sparkles size={14} color={Colors.dark.secondary} />
            <Text style={styles.headerBadgeText}>Command Center</Text>
          </View>
          <Text style={styles.title}>Admin Only</Text>
          <Text style={styles.subtitle}>All moderation and control tools are grouped here.</Text>
        </View>

        <View style={styles.list}>
          {ADMIN_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <PressableScale
                key={item.id}
                style={styles.row}
                onPress={() => router.push(item.route as any)}
                hapticType="selection"
              >
                <LinearGradient colors={item.colors} style={styles.iconWrap}>
                  <Icon size={20} color="#fff" />
                </LinearGradient>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSubtitle}>{item.subtitle}</Text>
                </View>
                <ChevronRight size={20} color={Colors.dark.textSecondary} />
              </PressableScale>
            );
          })}
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
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 36,
    gap: 14,
  },
  header: {
    paddingTop: 8,
    paddingBottom: 10,
    gap: 8,
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
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    color: Colors.dark.text,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  list: {
    gap: 11,
  },
  row: {
    backgroundColor: '#171924',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24283a',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: Colors.dark.text,
    fontSize: 19,
    fontWeight: '700',
  },
  rowSubtitle: {
    color: Colors.dark.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  blockedCard: {
    margin: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    padding: 14,
  },
  blockedTitle: {
    color: Colors.dark.error,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  blockedText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
  },
});
