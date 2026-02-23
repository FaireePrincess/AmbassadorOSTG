import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Users, FileCheck, BarChart3, Globe2, RadioTower, TimerReset, ChevronRight, Sparkles } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import PressableScale from '@/components/PressableScale';
import { trpc } from '@/lib/trpc';

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
  const { isAdmin, currentUser } = useAuth();
  const newsQuery = trpc.news.getCurrent.useQuery(undefined, { enabled: isAdmin });
  const saveNewsMutation = trpc.news.upsert.useMutation({
    onSuccess: () => {
      Alert.alert('Saved', 'What\'s News has been updated.');
      void newsQuery.refetch();
    },
    onError: (error) => {
      Alert.alert('Update failed', error.message || 'Could not save news update.');
    },
  });
  const [newsPostUrl, setNewsPostUrl] = useState('');
  const [newsText, setNewsText] = useState('');
  const [newsImageUrl, setNewsImageUrl] = useState('');

  useEffect(() => {
    if (!newsQuery.data) return;
    setNewsPostUrl(newsQuery.data.postUrl || '');
    setNewsText(newsQuery.data.text || '');
    setNewsImageUrl(newsQuery.data.imageUrl || '');
  }, [newsQuery.data]);

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

        <View style={styles.newsEditorCard}>
          <Text style={styles.newsEditorTitle}>What's News (Manual)</Text>
          <Text style={styles.newsEditorSubtitle}>Set Home news without calling X API.</Text>

          <TextInput
            style={styles.newsInput}
            placeholder="Post URL (https://x.com/.../status/...)"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="none"
            keyboardType="url"
            value={newsPostUrl}
            onChangeText={setNewsPostUrl}
          />

          <TextInput
            style={[styles.newsInput, styles.newsTextArea]}
            placeholder="Short summary shown on Home"
            placeholderTextColor={Colors.dark.textMuted}
            multiline
            numberOfLines={3}
            value={newsText}
            onChangeText={setNewsText}
          />

          <TextInput
            style={styles.newsInput}
            placeholder="Optional image URL"
            placeholderTextColor={Colors.dark.textMuted}
            autoCapitalize="none"
            keyboardType="url"
            value={newsImageUrl}
            onChangeText={setNewsImageUrl}
          />

          <PressableScale
            style={[styles.newsSaveBtn, saveNewsMutation.isPending && styles.newsSaveBtnDisabled]}
            onPress={() => {
              if (!currentUser?.id) {
                Alert.alert('Error', 'Active admin session required');
                return;
              }
              if (!newsPostUrl.trim()) {
                Alert.alert('Missing URL', 'Please enter the X post URL.');
                return;
              }
              saveNewsMutation.mutate({
                adminUserId: currentUser.id,
                postUrl: newsPostUrl.trim(),
                text: newsText.trim(),
                imageUrl: newsImageUrl.trim(),
              });
            }}
            disabled={saveNewsMutation.isPending}
          >
            <Text style={styles.newsSaveBtnText}>
              {saveNewsMutation.isPending ? 'Saving...' : 'Save Home News'}
            </Text>
          </PressableScale>
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
  newsEditorCard: {
    marginTop: 6,
    backgroundColor: '#171924',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#24283a',
    padding: 12,
    gap: 9,
  },
  newsEditorTitle: {
    color: Colors.dark.text,
    fontSize: 16,
    fontWeight: '700',
  },
  newsEditorSubtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
  },
  newsInput: {
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    color: Colors.dark.text,
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  newsTextArea: {
    minHeight: 76,
    textAlignVertical: 'top',
  },
  newsSaveBtn: {
    marginTop: 2,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.dark.primary,
  },
  newsSaveBtnDisabled: {
    opacity: 0.7,
  },
  newsSaveBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
});
