import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Image from '@/components/StableImage';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { normalizeAvatarUri } from '@/constants/avatarPresets';
import PlatformBadge from '@/components/PlatformBadge';
import LoadingScreen from '@/components/LoadingScreen';

export default function RegionalLeaderboardScreen() {
  const { currentUser, users, refreshUsers } = useAuth();
  const { ambassadorFeed, refreshData, isRefreshing } = useApp();

  const region = currentUser?.region || 'Unknown';

  const regionalUsers = useMemo(() => {
    return users
      .filter((user) => user.status === 'active' && user.region === region)
      .sort((a, b) => b.points - a.points)
      .map((user, index) => ({ ...user, regionalRank: index + 1 }));
  }, [users, region]);

  const regionUserIdSet = useMemo(() => new Set(regionalUsers.map((user) => user.id)), [regionalUsers]);

  const regionalFeed = useMemo(() => {
    return ambassadorFeed
      .filter((post) => regionUserIdSet.has(post.userId))
      .sort((a, b) => Date.parse(b.postedAt || '') - Date.parse(a.postedAt || ''))
      .slice(0, 20);
  }, [ambassadorFeed, regionUserIdSet]);

  const regionStats = useMemo(() => {
    const totalPoints = regionalUsers.reduce((sum, user) => sum + user.points, 0);
    const totalPosts = regionalUsers.reduce((sum, user) => sum + user.stats.totalPosts, 0);
    const totalImpressions = regionalUsers.reduce((sum, user) => sum + user.stats.totalImpressions, 0);
    return {
      ambassadors: regionalUsers.length,
      totalPoints,
      totalPosts,
      totalImpressions,
    };
  }, [regionalUsers]);

  if (!currentUser) {
    return <LoadingScreen message="Loading regional board..." />;
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => {
              void Promise.all([refreshData(), refreshUsers()]);
            }}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>{region} Regional Leaderboard</Text>
          <Text style={styles.subtitle}>Local rank, performance, and feed activity</Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{regionStats.ambassadors}</Text>
            <Text style={styles.statLabel}>Ambassadors</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{regionStats.totalPosts}</Text>
            <Text style={styles.statLabel}>Posts</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{Math.round(regionStats.totalImpressions / 1000)}K</Text>
            <Text style={styles.statLabel}>Impressions</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Rankings</Text>
          <View style={styles.card}>
            {regionalUsers.map((user) => (
              <View key={user.id} style={styles.row}>
                <View style={styles.leftRow}>
                  <View style={styles.rankBadge}>
                    <Text style={styles.rankBadgeText}>{user.regionalRank}</Text>
                  </View>
                  <Image source={normalizeAvatarUri(user.avatar)} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  <View>
                    <Text style={styles.name}>{user.name}</Text>
                    <Text style={styles.meta}>{user.stats.totalPosts} posts</Text>
                  </View>
                </View>
                <Text style={styles.points}>{user.points.toLocaleString()}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Regional Activity Feed</Text>
          {regionalFeed.map((post) => (
            <View key={post.id} style={styles.feedCard}>
              <View style={styles.feedHeader}>
                <Image source={normalizeAvatarUri(post.userAvatar)} style={styles.feedAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.feedName}>{post.userName}</Text>
                  <Text style={styles.feedMeta}>{new Date(post.postedAt).toLocaleDateString()}</Text>
                </View>
                <PlatformBadge platform={post.platform} size="small" />
              </View>
              <Text style={styles.feedText} numberOfLines={2}>{post.content}</Text>
            </View>
          ))}
          {regionalFeed.length === 0 && <Text style={styles.emptyText}>No regional activity yet.</Text>}
        </View>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  title: {
    color: Colors.dark.text,
    fontSize: 24,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  statValue: {
    color: Colors.dark.text,
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    color: Colors.dark.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  section: {
    marginTop: 16,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    color: Colors.dark.text,
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 10,
  },
  card: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rankBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + '20',
    borderWidth: 1,
    borderColor: Colors.dark.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rankBadgeText: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontWeight: '700',
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  name: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '600',
  },
  meta: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  points: {
    color: Colors.dark.warning,
    fontSize: 14,
    fontWeight: '700',
  },
  feedCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  feedAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
  },
  feedName: {
    color: Colors.dark.text,
    fontSize: 13,
    fontWeight: '600',
  },
  feedMeta: {
    color: Colors.dark.textMuted,
    fontSize: 11,
  },
  feedText: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: 8,
  },
  emptyText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
  },
});
