import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { ChevronLeft, X } from 'lucide-react-native';
import Image from '@/components/StableImage';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { normalizeAvatarUri } from '@/constants/avatarPresets';
import PlatformBadge from '@/components/PlatformBadge';
import LoadingScreen from '@/components/LoadingScreen';
import PressableScale from '@/components/PressableScale';
import type { User } from '@/types';

export default function RegionalLeaderboardScreen() {
  const router = useRouter();
  const { currentUser, users, refreshUsers, isAdmin } = useAuth();
  const { ambassadorFeed, refreshData, isRefreshing } = useApp();
  const [selectedRegion, setSelectedRegion] = useState<string>('');
  const [selectedAmbassador, setSelectedAmbassador] = useState<User | null>(null);

  useEffect(() => {
    if (currentUser?.region && !selectedRegion) {
      setSelectedRegion(currentUser.region);
    }
  }, [currentUser?.region, selectedRegion]);

  const availableRegions = useMemo(() => {
    const set = new Set(users.filter((u) => u.status === 'active').map((u) => u.region).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [users]);

  const region = selectedRegion || currentUser?.region || 'Unknown';

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
          <View style={styles.headerTop}>
            <PressableScale style={styles.backBtn} onPress={() => router.back()}>
              <ChevronLeft size={18} color={Colors.dark.text} />
              <Text style={styles.backBtnText}>Back</Text>
            </PressableScale>
          </View>
          <Text style={styles.title}>{region} Regional Leaderboard</Text>
          <Text style={styles.subtitle}>Local rank, performance, and feed activity</Text>
        </View>

        {isAdmin && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionFilterRow}>
            {availableRegions.map((item) => {
              const active = item === region;
              return (
                <PressableScale
                  key={item}
                  style={[styles.regionChip, active && styles.regionChipActive]}
                  onPress={() => setSelectedRegion(item)}
                >
                  <Text style={[styles.regionChipText, active && styles.regionChipTextActive]}>{item}</Text>
                </PressableScale>
              );
            })}
          </ScrollView>
        )}

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
              <PressableScale key={user.id} style={styles.row} onPress={() => setSelectedAmbassador(user)}>
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
              </PressableScale>
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

      <Modal visible={!!selectedAmbassador} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setSelectedAmbassador(null)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setSelectedAmbassador(null)}>
              <X size={22} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Ambassador Details</Text>
            <View style={{ width: 22 }} />
          </View>

          {selectedAmbassador && (
            <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
              <View style={styles.modalProfileTop}>
                <Image source={normalizeAvatarUri(selectedAmbassador.avatar)} style={styles.modalAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                <Text style={styles.modalName}>{selectedAmbassador.name}</Text>
                <Text style={styles.modalMeta}>{selectedAmbassador.region} • {selectedAmbassador.role.replace('_', ' ')}</Text>
              </View>

              <View style={styles.detailCard}>
                <Text style={styles.detailTitle}>Social Handles</Text>
                <Text style={styles.detailItem}>X: {selectedAmbassador.handles?.twitter || '-'}</Text>
                <Text style={styles.detailItem}>Instagram: {selectedAmbassador.handles?.instagram || '-'}</Text>
                <Text style={styles.detailItem}>TikTok: {selectedAmbassador.handles?.tiktok || '-'}</Text>
                <Text style={styles.detailItem}>YouTube: {selectedAmbassador.handles?.youtube || '-'}</Text>
                <Text style={styles.detailItem}>Discord: {selectedAmbassador.handles?.discord || '-'}</Text>
              </View>
            </ScrollView>
          )}
        </View>
      </Modal>
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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  backBtnText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '600',
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
  regionFilterRow: {
    paddingHorizontal: 20,
    gap: 8,
    paddingBottom: 4,
  },
  regionChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
  },
  regionChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  regionChipText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  regionChipTextActive: {
    color: Colors.dark.primary,
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
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
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
  modalProfileTop: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  modalAvatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginBottom: 10,
  },
  modalName: {
    color: Colors.dark.text,
    fontSize: 20,
    fontWeight: '700',
  },
  modalMeta: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  detailCard: {
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 12,
    padding: 12,
  },
  detailTitle: {
    color: Colors.dark.text,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  detailItem: {
    color: Colors.dark.textSecondary,
    fontSize: 13,
    marginBottom: 5,
  },
});
