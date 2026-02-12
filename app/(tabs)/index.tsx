import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Alert, Linking, TouchableOpacity } from 'react-native';
import Image from '@/components/StableImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronRight, Award, Zap } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { ambassadorPosts as mockPosts } from '@/mocks/data';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { isBackendEnabled } from '@/lib/trpc';
import { normalizeAvatarUri } from '@/constants/avatarPresets';
import StatCard from '@/components/StatCard';
import PlatformBadge from '@/components/PlatformBadge';
import PressableScale from '@/components/PressableScale';

export default function HomeScreen() {
  const router = useRouter();
  const { currentUser, users, refreshUsers } = useAuth();
  const { isRefreshing, refreshData, tasks, ambassadorFeed } = useApp();
  const backendEnabled = isBackendEnabled();

  const activeTasks = useMemo(() => 
    tasks.filter(t => t.status === 'active').slice(0, 3),
    [tasks]
  );
  
  const feedPosts = useMemo(() => {
    if (backendEnabled) {
      return ambassadorFeed;
    }
    return mockPosts;
  }, [ambassadorFeed, backendEnabled]);
  
  const topPosts = feedPosts.slice(0, 2);
  const allPosts = feedPosts.slice(0, 20);

  const [showLeaderboardExpanded, setShowLeaderboardExpanded] = useState(false);
  const [showFeedExpanded, setShowFeedExpanded] = useState(false);

  useEffect(() => {
    void refreshUsers();
  }, [refreshUsers]);

  const fullLeaderboard = useMemo(() => {
    const leaderboardUsers = users.filter((u) => u.status === 'active');
    if (currentUser && currentUser.status === 'active') {
      const currentUserIndex = leaderboardUsers.findIndex((u) => u.id === currentUser.id);
      if (currentUserIndex >= 0) {
        leaderboardUsers[currentUserIndex] = currentUser;
      } else {
        leaderboardUsers.push(currentUser);
      }
    }

    return leaderboardUsers
      .map(u => ({
        id: u.id,
        name: u.name,
        region: u.region,
        points: u.points,
        posts: u.stats.totalPosts,
      }))
      .sort((a, b) => b.points - a.points)
      .map((u, idx) => ({ ...u, rank: idx + 1 }));
  }, [users, currentUser]);

  const leaderboard = useMemo(() => fullLeaderboard.slice(0, 5), [fullLeaderboard]);
  const leaderboardRows = useMemo(
    () => (showLeaderboardExpanded ? fullLeaderboard : leaderboard),
    [showLeaderboardExpanded, fullLeaderboard, leaderboard]
  );
  const feedRows = useMemo(
    () => (showFeedExpanded ? allPosts : topPosts),
    [showFeedExpanded, allPosts, topPosts]
  );

  const userRank = useMemo(() => {
    if (!currentUser) return 0;
    const idx = fullLeaderboard.findIndex(u => u.id === currentUser.id);
    return idx >= 0 ? idx + 1 : 0;
  }, [currentUser, fullLeaderboard]);

  const userStats = useMemo(() => {
    if (!currentUser) return { totalPosts: 0, totalImpressions: 0, totalLikes: 0, points: 0 };
    return {
      totalPosts: currentUser.stats.totalPosts,
      totalImpressions: currentUser.stats.totalImpressions,
      totalLikes: currentUser.stats.totalLikes,
      points: currentUser.points,
    };
  }, [currentUser]);

  const handleRefresh = useCallback(() => {
    void Promise.all([refreshData(), refreshUsers()]);
  }, [refreshData, refreshUsers]);

  const openPostUrl = useCallback((url: string) => {
    const trimmed = url.trim();
    if (!trimmed) {
      Alert.alert('Error', 'Post link is missing');
      return;
    }

    const normalizedUrl = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    try {
      if (typeof window !== 'undefined') {
        const tg = (window as any).Telegram?.WebApp;
        if (typeof tg?.openLink === 'function') {
          tg.openLink(normalizedUrl);
          return;
        }

        const opened = window.open(normalizedUrl, '_blank', 'noopener,noreferrer');
        if (opened) return;
      }
    } catch {
    }

    Linking.openURL(normalizedUrl).catch(() => {
      Alert.alert('Error', 'Could not open link');
    });
  }, []);

  if (!currentUser) {
    return null;
  }

  const user = currentUser;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.dark.primary}
            colors={[Colors.dark.primary]}
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={styles.greeting}>Welcome back,</Text>
              <Text style={styles.userName} testID="user-name">{user.name}</Text>
            </View>
            <PressableScale onPress={() => router.push('/profile')} testID="avatar-button">
              <Image source={normalizeAvatarUri(user.avatar)} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            </PressableScale>
          </View>
          
          <View style={styles.rankCard}>
            <View style={styles.rankLeft}>
              <Award size={24} color={Colors.dark.warning} />
              <View style={styles.rankInfo}>
                <Text style={styles.rankLabel}>Your Rank</Text>
                <Text style={styles.rankValue} testID="user-rank">#{userRank || '-'}</Text>
              </View>
            </View>
            <View style={styles.pointsContainer}>
              <Text style={styles.pointsValue} testID="user-points">{userStats.points.toLocaleString()}</Text>
              <Text style={styles.pointsLabel}>Points</Text>
            </View>
          </View>
        </View>

        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your Performance</Text>
          <View style={styles.statsGrid}>
            <StatCard label="Posts" value={userStats.totalPosts} color={Colors.dark.primary} compact />
            <StatCard label="Views" value={userStats.totalImpressions} color={Colors.dark.secondary} compact />
            <StatCard label="Likes" value={userStats.totalLikes} color={Colors.dark.accent} compact />
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Active Tasks</Text>
            <PressableScale style={styles.seeAllBtn} onPress={() => router.push('/(tabs)/tasks')} testID="see-all-tasks">
              <Text style={styles.seeAllText}>See All</Text>
              <ChevronRight size={16} color={Colors.dark.primary} />
            </PressableScale>
          </View>
          
          {activeTasks.map((task) => (
            <PressableScale 
              key={task.id} 
              style={styles.taskCard}
              onPress={() => router.push(`/task/${task.id}`)}
              testID={`task-card-${task.id}`}
            >
              <View style={styles.taskHeader}>
                <View style={styles.taskBadges}>
                  {task.platforms.map((p) => (
                    <PlatformBadge key={p} platform={p} size="small" />
                  ))}
                </View>
                <View style={styles.pointsBadge}>
                  <Zap size={12} color={Colors.dark.warning} />
                  <Text style={styles.pointsBadgeText}>{task.points}</Text>
                </View>
              </View>
              <Text style={styles.taskTitle}>{task.title}</Text>
              <Text style={styles.taskCampaign}>{task.campaignTitle}</Text>
              <View style={styles.taskFooter}>
                <Text style={styles.taskDeadline}>Due {new Date(task.deadline).toLocaleDateString()}</Text>
                <Text style={styles.taskSubmissions}>{task.submissions} submissions</Text>
              </View>
            </PressableScale>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Leaderboard</Text>
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowLeaderboardExpanded((prev) => !prev)} activeOpacity={0.8}>
              <Text style={styles.seeAllText}>{showLeaderboardExpanded ? 'Top 5' : 'Full Board'}</Text>
              <ChevronRight size={16} color={Colors.dark.primary} />
            </TouchableOpacity>
          </View>
          
          <View style={styles.leaderboardCard}>
            {leaderboardRows.map((entry, index) => (
              <View key={entry.id} style={[styles.leaderboardRow, index !== leaderboardRows.length - 1 && styles.leaderboardRowBorder]}>
                <View style={styles.leaderboardLeft}>
                  <View style={[styles.rankBadge, index < 3 && styles.topRankBadge]}>
                    <Text style={[styles.rankBadgeText, index < 3 && styles.topRankText]}>
                      {entry.rank}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.leaderboardName}>{entry.name}</Text>
                    <Text style={styles.leaderboardRegion}>{entry.region}</Text>
                  </View>
                </View>
                <View style={styles.leaderboardRight}>
                  <Text style={styles.leaderboardPoints}>{entry.points.toLocaleString()}</Text>
                  <Text style={styles.leaderboardPosts}>{entry.posts} posts</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ambassador Feed</Text>
            <TouchableOpacity style={styles.seeAllBtn} onPress={() => setShowFeedExpanded((prev) => !prev)} activeOpacity={0.8}>
              <Text style={styles.seeAllText}>{showFeedExpanded ? 'Show Less' : 'See All'}</Text>
              <ChevronRight size={16} color={Colors.dark.primary} />
            </TouchableOpacity>
          </View>
          
          {feedRows.map((post) => (
            <View key={post.id} style={styles.postCard}>
              <View style={styles.postHeader}>
                <Image source={normalizeAvatarUri(post.userAvatar)} style={styles.postAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                <View style={styles.postUserInfo}>
                  <Text style={styles.postUserName}>{post.userName}</Text>
                  <Text style={styles.postRegion}>{post.userRegion}</Text>
                </View>
                <PlatformBadge platform={post.platform} />
              </View>
              {post.thumbnail && (
                <Image source={post.thumbnail} style={styles.postImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              )}
              <Text style={styles.postContent} numberOfLines={2}>{post.content}</Text>
              <View style={styles.postMetrics}>
                <Text style={styles.metricText}>{(post.metrics.impressions / 1000).toFixed(1)}K views</Text>
                <Text style={styles.metricDot}>•</Text>
                <Text style={styles.metricText}>{post.metrics.likes} likes</Text>
                <Text style={styles.metricDot}>•</Text>
                <Text style={styles.metricText}>{post.metrics.shares} shares</Text>
              </View>
              <PressableScale style={[styles.viewPostBtn, !post.postUrl && styles.viewPostBtnDisabled]} onPress={() => openPostUrl(post.postUrl)} disabled={!post.postUrl}>
                <Text style={styles.viewPostText}>View Post</Text>
              </PressableScale>
            </View>
          ))}
        </View>

        <View style={styles.bottomPadding} />
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
    padding: 20,
    paddingBottom: 0,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  greeting: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginTop: 2,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  rankCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  rankLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankInfo: {
    gap: 2,
  },
  rankLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  rankValue: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  pointsContainer: {
    alignItems: 'flex-end',
  },
  pointsValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.primary,
  },
  pointsLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  statsSection: {
    padding: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: '600' as const,
  },
  taskCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskBadges: {
    flexDirection: 'row',
    gap: 6,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.warning + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pointsBadgeText: {
    color: Colors.dark.warning,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  taskCampaign: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 12,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  taskDeadline: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  taskSubmissions: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  leaderboardCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  leaderboardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  leaderboardRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  leaderboardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topRankBadge: {
    backgroundColor: Colors.dark.warning + '20',
  },
  rankBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.dark.textSecondary,
  },
  topRankText: {
    color: Colors.dark.warning,
  },
  leaderboardName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  leaderboardRegion: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  leaderboardRight: {
    alignItems: 'flex-end',
  },
  leaderboardPoints: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark.primary,
  },
  leaderboardPosts: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  postCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  postAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  postUserInfo: {
    flex: 1,
    marginLeft: 12,
  },
  postUserName: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  postRegion: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  postImage: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    marginBottom: 12,
  },
  postContent: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  postMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  viewPostBtn: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.dark.primary + '70',
    backgroundColor: Colors.dark.primary + '18',
  },
  viewPostBtnDisabled: {
    opacity: 0.5,
  },
  viewPostText: {
    color: Colors.dark.primary,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  inlinePanel: {
    marginTop: 12,
  },
  metricText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  metricDot: {
    color: Colors.dark.textMuted,
    marginHorizontal: 8,
  },
  bottomPadding: {
    height: 20,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  modalTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  leaderboardModalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  topThreeRow: {
    borderColor: Colors.dark.warning + '40',
    backgroundColor: Colors.dark.warning + '10',
  },
  modalRankBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalRankText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark.textSecondary,
  },
  leaderboardUserInfo: {
    marginLeft: 12,
  },
  modalBottomPadding: {
    height: 40,
  },
});
