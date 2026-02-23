import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, Modal, TextInput, Alert, RefreshControl, Linking, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FileCheck, Clock, CheckCircle, XCircle, Edit3, ExternalLink, Star, X, Users, MessageSquare, TrendingUp, AlertCircle, RotateCcw, RefreshCw, Eye, Heart, Repeat, MessageCircle, ChevronLeft } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useApp, useUserSubmissions } from '@/contexts/AppContext';
import { Submission, SubmissionRating, SubmissionStatus, Platform } from '@/types';
import PlatformBadge from '@/components/PlatformBadge';
import StatusBadge from '@/components/StatusBadge';
import PressableScale from '@/components/PressableScale';
import EmptyState from '@/components/EmptyState';
import { trpc } from '@/lib/trpc';

type FilterTab = 'pending' | 'approved' | 'needs_edits' | 'rejected';

const RATING_CRITERIA = [
  { key: 'relevanceToTask', label: 'Relevance to Task', maxPoints: 25, description: 'Followed brief, correct hashtags/tags/platform/message' },
  { key: 'creativity', label: 'Creativity', maxPoints: 15, description: 'Angle, storytelling, originality of presentation' },
  { key: 'originality', label: 'Originality', maxPoints: 15, description: 'Own content, not copy-paste/duplicate/lazy' },
  { key: 'effortFormat', label: 'Effort & Format', maxPoints: 15, description: 'Text < Image < Edited video/IRL/voice' },
  { key: 'enthusiasmTone', label: 'Enthusiasm & Tone', maxPoints: 10, description: 'Genuine support, positive energy, not forced' },
] as const;

function AdminReviewScreen() {
  const router = useRouter();
  const { users, refreshUsers } = useAuth();
  const { allSubmissions, reviewSubmission, isRefreshing, refreshData, deleteSubmission } = useApp();
  const [activeTab, setActiveTab] = useState<FilterTab>('pending');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isReviewModalVisible, setIsReviewModalVisible] = useState(false);
  
  const [ratings, setRatings] = useState({
    relevanceToTask: 15,
    creativity: 10,
    originality: 10,
    effortFormat: 10,
    enthusiasmTone: 6,
  });
  const [engagementScore, setEngagementScore] = useState(10);
  const [feedback, setFeedback] = useState('');
  const [ratingNotes, setRatingNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fetchedMetrics, setFetchedMetrics] = useState<{
    impressions: number;
    likes: number;
    retweets: number;
    replies: number;
  } | null>(null);
  const [isFetchingMetrics, setIsFetchingMetrics] = useState(false);

  const twitterHealthQuery = trpc.twitter.healthCheck.useQuery(undefined, {
    enabled: false,
    retry: false,
  });
  const trpcUtils = trpc.useUtils();

  const filteredSubmissions = useMemo(() => {
    return allSubmissions.filter(s => s.status === activeTab);
  }, [allSubmissions, activeTab]);

  const tabCounts = useMemo(() => ({
    pending: allSubmissions.filter(s => s.status === 'pending').length,
    approved: allSubmissions.filter(s => s.status === 'approved').length,
    needs_edits: allSubmissions.filter(s => s.status === 'needs_edits').length,
    rejected: allSubmissions.filter(s => s.status === 'rejected').length,
  }), [allSubmissions]);

  const calculateTotalScore = useCallback(() => {
    const contentScore = Object.values(ratings).reduce((sum, val) => sum + val, 0);
    return contentScore + engagementScore;
  }, [ratings, engagementScore]);

  const getUserName = useCallback((userId: string) => {
    const user = users.find(u => u.id === userId);
    return user?.name || 'Unknown User';
  }, [users]);

  const openReviewModal = useCallback((submission: Submission) => {
    setSelectedSubmission(submission);
    setRatings({
      relevanceToTask: submission.rating?.relevanceToTask ?? 15,
      creativity: submission.rating?.creativity ?? 10,
      originality: submission.rating?.originality ?? 10,
      effortFormat: submission.rating?.effortFormat ?? 10,
      enthusiasmTone: submission.rating?.enthusiasmTone ?? 6,
    });
    setEngagementScore(submission.rating?.engagementScore ?? 10);
    setFeedback(submission.feedback || '');
    setRatingNotes(submission.rating?.notes || '');
    setFetchedMetrics(submission.metrics ? {
      impressions: submission.metrics.impressions,
      likes: submission.metrics.likes,
      retweets: submission.metrics.shares,
      replies: submission.metrics.comments,
    } : null);
    setIsReviewModalVisible(true);
  }, []);

  const isTwitterPost = useCallback((submission: Submission | null) => {
    if (!submission) return false;
    return submission.platform === 'twitter' && 
      (submission.postUrl.includes('twitter.com') || submission.postUrl.includes('x.com'));
  }, []);

  const handleFetchTwitterMetrics = useCallback(async () => {
    if (!selectedSubmission || !isTwitterPost(selectedSubmission)) return;
    
    setIsFetchingMetrics(true);
    try {
      const data = await trpcUtils.twitter.getTweetMetrics.fetch({ tweetUrl: selectedSubmission.postUrl });
      if (data) {
        setFetchedMetrics({
          impressions: data.metrics.impressions,
          likes: data.metrics.likes,
          retweets: data.metrics.retweets,
          replies: data.metrics.replies,
        });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        console.log('[Twitter] Metrics fetched successfully:', data.metrics);
      }
    } catch (error: unknown) {
      console.error('[Twitter] Failed to fetch metrics:', error);
      Alert.alert('Error', 'Failed to fetch Twitter metrics. Please try again.');
    } finally {
      setIsFetchingMetrics(false);
    }
  }, [selectedSubmission, isTwitterPost, trpcUtils]);

  const handleReview = useCallback(async (status: SubmissionStatus) => {
    if (!selectedSubmission) return;

    setIsSubmitting(true);
    const rating: SubmissionRating = {
      relevanceToTask: ratings.relevanceToTask,
      creativity: ratings.creativity,
      originality: ratings.originality,
      effortFormat: ratings.effortFormat,
      enthusiasmTone: ratings.enthusiasmTone,
      engagementScore,
      totalScore: calculateTotalScore(),
      notes: ratingNotes || undefined,
    };

    const metricsToSave = fetchedMetrics ? {
      impressions: fetchedMetrics.impressions,
      likes: fetchedMetrics.likes,
      comments: fetchedMetrics.replies,
      shares: fetchedMetrics.retweets,
    } : undefined;

    const result = await reviewSubmission(
      selectedSubmission.id,
      status,
      status === 'approved' ? rating : undefined,
      feedback || undefined,
      metricsToSave
    );

    setIsSubmitting(false);

    if (result.success) {
      await refreshUsers();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsReviewModalVisible(false);
      setSelectedSubmission(null);
      Alert.alert('Success', `Submission ${status === 'approved' ? 'approved' : status === 'needs_edits' ? 'marked for edits' : 'rejected'}`);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to review submission');
    }
  }, [selectedSubmission, ratings, engagementScore, feedback, ratingNotes, calculateTotalScore, reviewSubmission, fetchedMetrics, refreshUsers]);

  const handleDeleteSubmission = useCallback((submission: Submission) => {
    const userName = getUserName(submission.userId);
    Alert.alert(
      'Reset Submission',
      `This will delete ${userName}'s submission for "${submission.taskTitle}". They will be able to submit again for this task.\n\nAre you sure?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete & Reset',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const result = await deleteSubmission(submission.id);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setIsReviewModalVisible(false);
              setSelectedSubmission(null);
              Alert.alert('Success', 'Submission deleted. User can now resubmit for this task.');
            } else {
              Alert.alert('Error', result.error || 'Failed to delete submission');
            }
          },
        },
      ]
    );
  }, [deleteSubmission, getUserName]);

  const openPostUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link');
    });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View style={styles.headerMain}>
          <PressableScale style={styles.backBtn} onPress={() => router.push('/(tabs)/admin' as any)}>
            <ChevronLeft size={16} color={Colors.dark.text} />
            <Text style={styles.backBtnText}>Admin</Text>
          </PressableScale>
          <Text style={styles.headerTitle}>Review Submissions</Text>
        </View>
        <View style={styles.headerStats}>
          <View style={styles.statBadge}>
            <Clock size={14} color={Colors.dark.warning} />
            <Text style={styles.statText}>{tabCounts.pending} pending</Text>
          </View>
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['pending', 'approved', 'needs_edits', 'rejected'] as FilterTab[]).map((tab) => (
            <PressableScale
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              hapticType="selection"
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'needs_edits' ? 'Needs Edits' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab && styles.tabBadgeTextActive]}>
                  {tabCounts[tab]}
                </Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshData}
            tintColor={Colors.dark.primary}
          />
        }
      >
        {filteredSubmissions.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="No submissions"
            message={`No ${activeTab === 'needs_edits' ? 'submissions needing edits' : activeTab + ' submissions'} to display`}
          />
        ) : (
          filteredSubmissions.map((submission) => (
            <PressableScale
              key={submission.id}
              style={styles.submissionCard}
              onPress={() => openReviewModal(submission)}
            >
              <View style={styles.submissionHeader}>
                <View style={styles.submissionMeta}>
                  <PlatformBadge platform={submission.platform} />
                  <StatusBadge status={submission.status} />
                </View>
                {submission.rating && (
                  <View style={styles.scoreBadge}>
                    <Star size={14} color={Colors.dark.warning} />
                    <Text style={styles.scoreText}>{submission.rating.totalScore}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.submissionTitle}>{submission.taskTitle}</Text>
              <Text style={styles.submissionCampaign}>{submission.campaignTitle}</Text>

              <View style={styles.submissionInfo}>
                <View style={styles.infoItem}>
                  <Users size={14} color={Colors.dark.textMuted} />
                  <Text style={styles.infoText}>{getUserName(submission.userId)}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Clock size={14} color={Colors.dark.textMuted} />
                  <Text style={styles.infoText}>
                    {new Date(submission.submittedAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <PressableScale
                style={styles.viewPostBtn}
                onPress={() => openPostUrl(submission.postUrl)}
              >
                <ExternalLink size={14} color={Colors.dark.primary} />
                <Text style={styles.viewPostText}>View Post</Text>
              </PressableScale>
            </PressableScale>
          ))
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isReviewModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsReviewModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsReviewModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Review Submission</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedSubmission && (
              <>
                <View style={styles.submissionPreview}>
                  <View style={styles.previewHeader}>
                    <PlatformBadge platform={selectedSubmission.platform} />
                    <PressableScale
                      style={styles.openLinkBtn}
                      onPress={() => openPostUrl(selectedSubmission.postUrl)}
                    >
                      <ExternalLink size={16} color={Colors.dark.primary} />
                      <Text style={styles.openLinkText}>Open Post</Text>
                    </PressableScale>
                  </View>
                  <Text style={styles.previewTitle}>{selectedSubmission.taskTitle}</Text>
                  <Text style={styles.previewCampaign}>{selectedSubmission.campaignTitle}</Text>
                  <Text style={styles.previewUser}>Submitted by: {getUserName(selectedSubmission.userId)}</Text>
                  {selectedSubmission.notes && (
                    <View style={styles.notesBox}>
                      <MessageSquare size={14} color={Colors.dark.textMuted} />
                      <Text style={styles.notesText}>{selectedSubmission.notes}</Text>
                    </View>
                  )}
                </View>

                <View style={styles.ratingSection}>
                  <Text style={styles.ratingSectionTitle}>Content Quality & Execution (80 pts)</Text>
                  <Text style={styles.ratingSectionSubtitle}>Score each criteria based on max points</Text>

                  {RATING_CRITERIA.map((criteria) => {
                    const currentValue = ratings[criteria.key as keyof typeof ratings];
                    const options = criteria.maxPoints === 25 
                      ? [0, 5, 10, 15, 20, 25] 
                      : criteria.maxPoints === 15 
                        ? [0, 5, 10, 15] 
                        : [0, 3, 6, 10];
                    return (
                      <View key={criteria.key} style={styles.criteriaRow}>
                        <View style={styles.criteriaInfo}>
                          <View style={styles.criteriaHeader}>
                            <Text style={styles.criteriaLabel}>{criteria.label}</Text>
                            <Text style={styles.criteriaPoints}>{currentValue}/{criteria.maxPoints}</Text>
                          </View>
                          <Text style={styles.criteriaDescription}>{criteria.description}</Text>
                        </View>
                        <View style={styles.pointsRow}>
                          {options.map((value) => (
                            <PressableScale
                              key={value}
                              style={[styles.pointOption, currentValue === value && styles.pointOptionActive]}
                              onPress={() => setRatings(prev => ({ ...prev, [criteria.key]: value }))}
                              hapticType="selection"
                            >
                              <Text style={[styles.pointOptionText, currentValue === value && styles.pointOptionTextActive]}>
                                {value}
                              </Text>
                            </PressableScale>
                          ))}
                        </View>
                      </View>
                    );
                  })}
                </View>

                <View style={styles.metricsSection}>
                  <Text style={styles.ratingSectionTitle}>Engagement & Reach (max 20 pts)</Text>
                  <Text style={styles.ratingSectionSubtitle}>Scored relative to account size, not raw numbers</Text>

                  <View style={styles.twitterMetricsContainer}>
                    <View style={styles.twitterMetricsHeader}>
                      <Text style={styles.twitterMetricsTitle}>Post Metrics</Text>
                      {isTwitterPost(selectedSubmission) && (
                        <PressableScale
                          style={[styles.fetchMetricsBtn, isFetchingMetrics && styles.fetchMetricsBtnDisabled]}
                          onPress={handleFetchTwitterMetrics}
                          disabled={isFetchingMetrics}
                        >
                          {isFetchingMetrics ? (
                            <ActivityIndicator size="small" color={Colors.dark.primary} />
                          ) : (
                            <>
                              <RefreshCw size={14} color={Colors.dark.primary} />
                              <Text style={styles.fetchMetricsText}>Auto-fetch</Text>
                            </>
                          )}
                        </PressableScale>
                      )}
                    </View>
                    
                    <Text style={styles.metricsHelpText}>Enter metrics manually or auto-fetch (X/Twitter only)</Text>

                    <View style={styles.metricsInputGrid}>
                      <View style={styles.metricInputCard}>
                        <View style={styles.metricInputHeader}>
                          <Eye size={14} color={Colors.dark.primary} />
                          <Text style={styles.metricInputLabel}>Impressions</Text>
                        </View>
                        <TextInput
                          style={styles.metricInput}
                          value={fetchedMetrics?.impressions?.toString() || ''}
                          onChangeText={(text) => {
                            const num = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
                            setFetchedMetrics(prev => ({
                              impressions: num,
                              likes: prev?.likes || 0,
                              retweets: prev?.retweets || 0,
                              replies: prev?.replies || 0,
                            }));
                          }}
                          placeholder="0"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.metricInputCard}>
                        <View style={styles.metricInputHeader}>
                          <Heart size={14} color={Colors.dark.error} />
                          <Text style={styles.metricInputLabel}>Likes</Text>
                        </View>
                        <TextInput
                          style={styles.metricInput}
                          value={fetchedMetrics?.likes?.toString() || ''}
                          onChangeText={(text) => {
                            const num = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
                            setFetchedMetrics(prev => ({
                              impressions: prev?.impressions || 0,
                              likes: num,
                              retweets: prev?.retweets || 0,
                              replies: prev?.replies || 0,
                            }));
                          }}
                          placeholder="0"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.metricInputCard}>
                        <View style={styles.metricInputHeader}>
                          <Repeat size={14} color={Colors.dark.success} />
                          <Text style={styles.metricInputLabel}>Retweets</Text>
                        </View>
                        <TextInput
                          style={styles.metricInput}
                          value={fetchedMetrics?.retweets?.toString() || ''}
                          onChangeText={(text) => {
                            const num = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
                            setFetchedMetrics(prev => ({
                              impressions: prev?.impressions || 0,
                              likes: prev?.likes || 0,
                              retweets: num,
                              replies: prev?.replies || 0,
                            }));
                          }}
                          placeholder="0"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                      <View style={styles.metricInputCard}>
                        <View style={styles.metricInputHeader}>
                          <MessageCircle size={14} color={Colors.dark.secondary} />
                          <Text style={styles.metricInputLabel}>Replies</Text>
                        </View>
                        <TextInput
                          style={styles.metricInput}
                          value={fetchedMetrics?.replies?.toString() || ''}
                          onChangeText={(text) => {
                            const num = parseInt(text.replace(/[^0-9]/g, ''), 10) || 0;
                            setFetchedMetrics(prev => ({
                              impressions: prev?.impressions || 0,
                              likes: prev?.likes || 0,
                              retweets: prev?.retweets || 0,
                              replies: num,
                            }));
                          }}
                          placeholder="0"
                          placeholderTextColor={Colors.dark.textMuted}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>
                  </View>
                  
                  <View style={styles.engagementInfo}>
                    <Text style={styles.engagementGuide}>0-5: Very low • 6-10: Average • 11-15: Above avg • 16-20: Exceptional</Text>
                  </View>
                  
                  <View style={styles.bonusRow}>
                    <View style={styles.bonusSlider}>
                      {[0, 5, 10, 15, 20].map((value) => (
                        <PressableScale
                          key={value}
                          style={[styles.bonusOption, engagementScore === value && styles.bonusOptionActive]}
                          onPress={() => setEngagementScore(value)}
                          hapticType="selection"
                        >
                          <Text style={[styles.bonusOptionText, engagementScore === value && styles.bonusOptionTextActive]}>
                            {value}
                          </Text>
                        </PressableScale>
                      ))}
                    </View>
                  </View>
                </View>

                <View style={styles.totalScoreBox}>
                  <TrendingUp size={20} color={Colors.dark.primary} />
                  <Text style={styles.totalScoreLabel}>Total Score:</Text>
                  <Text style={styles.totalScoreValue}>{calculateTotalScore()}/100</Text>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Rating Notes (internal)</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={ratingNotes}
                    onChangeText={setRatingNotes}
                    placeholder="Internal notes about this rating..."
                    placeholderTextColor={Colors.dark.textMuted}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Feedback for Ambassador</Text>
                  <TextInput
                    style={[styles.input, styles.textArea]}
                    value={feedback}
                    onChangeText={setFeedback}
                    placeholder="Feedback visible to the ambassador..."
                    placeholderTextColor={Colors.dark.textMuted}
                    multiline
                    numberOfLines={3}
                  />
                </View>

                <View style={styles.actionButtons}>
                  <PressableScale
                    style={[styles.actionBtn, styles.rejectBtn]}
                    onPress={() => handleReview('rejected')}
                    disabled={isSubmitting}
                  >
                    <XCircle size={18} color={Colors.dark.error} />
                    <Text style={styles.rejectBtnText}>Reject</Text>
                  </PressableScale>
                  <PressableScale
                    style={[styles.actionBtn, styles.editsBtn]}
                    onPress={() => handleReview('needs_edits')}
                    disabled={isSubmitting}
                  >
                    <Edit3 size={18} color={Colors.dark.warning} />
                    <Text style={styles.editsBtnText}>Needs Edits</Text>
                  </PressableScale>
                  <PressableScale
                    style={[styles.actionBtn, styles.approveBtn, isSubmitting && styles.btnDisabled]}
                    onPress={() => handleReview('approved')}
                    disabled={isSubmitting}
                  >
                    <CheckCircle size={18} color="#FFF" />
                    <Text style={styles.approveBtnText}>{isSubmitting ? 'Saving...' : 'Approve'}</Text>
                  </PressableScale>
                </View>

                <PressableScale
                  style={styles.resetSubmissionBtn}
                  onPress={() => handleDeleteSubmission(selectedSubmission)}
                  hapticType="light"
                >
                  <RotateCcw size={16} color={Colors.dark.textMuted} />
                  <Text style={styles.resetSubmissionText}>Delete & Allow Resubmission</Text>
                </PressableScale>

                <View style={styles.modalBottomPadding} />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function UserSubmissionsScreen() {
  const { currentUser } = useAuth();
  const { isRefreshing, refreshData, updateSubmission } = useApp();
  const userSubmissions = useUserSubmissions(currentUser?.id);
  const [activeTab, setActiveTab] = useState<FilterTab | 'all'>('all');
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [isDetailModalVisible, setIsDetailModalVisible] = useState(false);
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editPlatform, setEditPlatform] = useState<Platform>('twitter');
  const [editPostUrl, setEditPostUrl] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isEditingSubmission, setIsEditingSubmission] = useState(false);

  const filteredSubmissions = useMemo(() => {
    if (activeTab === 'all') return userSubmissions;
    return userSubmissions.filter(s => s.status === activeTab);
  }, [userSubmissions, activeTab]);

  const tabCounts = useMemo(() => ({
    all: userSubmissions.length,
    pending: userSubmissions.filter(s => s.status === 'pending').length,
    approved: userSubmissions.filter(s => s.status === 'approved').length,
    needs_edits: userSubmissions.filter(s => s.status === 'needs_edits').length,
    rejected: userSubmissions.filter(s => s.status === 'rejected').length,
  }), [userSubmissions]);

  const openDetailModal = useCallback((submission: Submission) => {
    setSelectedSubmission(submission);
    setIsDetailModalVisible(true);
  }, []);

  const openPostUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link');
    });
  }, []);

  const openEditModal = useCallback((submission: Submission) => {
    setEditPlatform(submission.platform);
    setEditPostUrl(submission.postUrl);
    setEditNotes(submission.notes || '');
    setIsEditModalVisible(true);
  }, []);

  const handleSaveEdits = useCallback(async () => {
    if (!selectedSubmission || !currentUser?.id) return;
    if (!editPostUrl.trim()) {
      Alert.alert('Post URL Required', 'Please enter your updated post URL.');
      return;
    }

    setIsEditingSubmission(true);
    const result = await updateSubmission(selectedSubmission.id, currentUser.id, {
      platform: editPlatform,
      postUrl: editPostUrl.trim(),
      notes: editNotes.trim() || undefined,
    });
    setIsEditingSubmission(false);

    if (!result.success) {
      Alert.alert('Error', result.error || 'Failed to update submission');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditModalVisible(false);
    setIsDetailModalVisible(false);
    setSelectedSubmission(null);
    await refreshData();
    Alert.alert('Updated', 'Your submission was updated and sent back to pending review.');
  }, [selectedSubmission, currentUser?.id, editPlatform, editPostUrl, editNotes, updateSubmission, refreshData]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Submissions</Text>
        <View style={styles.headerStats}>
          {tabCounts.pending > 0 && (
            <View style={styles.statBadge}>
              <Clock size={14} color={Colors.dark.warning} />
              <Text style={styles.statText}>{tabCounts.pending} pending</Text>
            </View>
          )}
          {tabCounts.needs_edits > 0 && (
            <View style={[styles.statBadge, { backgroundColor: Colors.dark.error + '20' }]}>
              <AlertCircle size={14} color={Colors.dark.error} />
              <Text style={[styles.statText, { color: Colors.dark.error }]}>{tabCounts.needs_edits} need edits</Text>
            </View>
          )}
        </View>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['all', 'pending', 'approved', 'needs_edits', 'rejected'] as (FilterTab | 'all')[]).map((tab) => (
            <PressableScale
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              hapticType="selection"
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab === 'all' ? 'All' : tab === 'needs_edits' ? 'Needs Edits' : tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
              <View style={[styles.tabBadge, activeTab === tab && styles.tabBadgeActive]}>
                <Text style={[styles.tabBadgeText, activeTab === tab && styles.tabBadgeTextActive]}>
                  {tabCounts[tab]}
                </Text>
              </View>
            </PressableScale>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshData}
            tintColor={Colors.dark.primary}
          />
        }
      >
        {filteredSubmissions.length === 0 ? (
          <EmptyState
            icon={FileCheck}
            title="No submissions"
            message={activeTab === 'all' ? "You haven't submitted any content yet. Complete a task to see it here!" : `No ${activeTab === 'needs_edits' ? 'submissions needing edits' : activeTab + ' submissions'}`}
          />
        ) : (
          filteredSubmissions.map((submission) => (
            <PressableScale
              key={submission.id}
              style={styles.submissionCard}
              onPress={() => openDetailModal(submission)}
            >
              <View style={styles.submissionHeader}>
                <View style={styles.submissionMeta}>
                  <PlatformBadge platform={submission.platform} />
                  <StatusBadge status={submission.status} />
                </View>
                {submission.rating && (
                  <View style={styles.scoreBadge}>
                    <Star size={14} color={Colors.dark.warning} />
                    <Text style={styles.scoreText}>{submission.rating.totalScore}</Text>
                  </View>
                )}
              </View>

              <Text style={styles.submissionTitle}>{submission.taskTitle}</Text>
              <Text style={styles.submissionCampaign}>{submission.campaignTitle}</Text>

              <View style={styles.submissionInfo}>
                <View style={styles.infoItem}>
                  <Clock size={14} color={Colors.dark.textMuted} />
                  <Text style={styles.infoText}>
                    Submitted {new Date(submission.submittedAt).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              {submission.feedback && (
                <View style={styles.feedbackPreview}>
                  <MessageSquare size={14} color={Colors.dark.warning} />
                  <Text style={styles.feedbackPreviewText} numberOfLines={1}>{submission.feedback}</Text>
                </View>
              )}

              <PressableScale
                style={styles.viewPostBtn}
                onPress={() => openPostUrl(submission.postUrl)}
              >
                <ExternalLink size={14} color={Colors.dark.primary} />
                <Text style={styles.viewPostText}>View Post</Text>
              </PressableScale>
            </PressableScale>
          ))
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isDetailModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsDetailModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsDetailModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Submission Details</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {selectedSubmission && (
              <>
                <View style={styles.submissionPreview}>
                  <View style={styles.previewHeader}>
                    <PlatformBadge platform={selectedSubmission.platform} />
                    <StatusBadge status={selectedSubmission.status} />
                  </View>
                  <Text style={styles.previewTitle}>{selectedSubmission.taskTitle}</Text>
                  <Text style={styles.previewCampaign}>{selectedSubmission.campaignTitle}</Text>
                  <Text style={styles.previewUser}>
                    Submitted: {new Date(selectedSubmission.submittedAt).toLocaleDateString()}
                  </Text>
                  
                  <PressableScale
                    style={[styles.viewPostBtn, { marginTop: 12 }]}
                    onPress={() => openPostUrl(selectedSubmission.postUrl)}
                  >
                    <ExternalLink size={14} color={Colors.dark.primary} />
                    <Text style={styles.viewPostText}>View Post</Text>
                  </PressableScale>
                </View>

                {selectedSubmission.status === 'approved' && selectedSubmission.rating && (
                  <View style={styles.ratingDisplay}>
                    <Text style={styles.ratingSectionTitle}>Your Score</Text>
                    <View style={styles.totalScoreBox}>
                      <Star size={24} color={Colors.dark.warning} fill={Colors.dark.warning} />
                      <Text style={styles.totalScoreValue}>{selectedSubmission.rating.totalScore}/100</Text>
                    </View>
                  </View>
                )}

                {selectedSubmission.feedback && (
                  <View style={styles.feedbackSection}>
                    <Text style={styles.ratingSectionTitle}>Admin Feedback</Text>
                    <View style={styles.feedbackBox}>
                      <MessageSquare size={16} color={Colors.dark.primary} />
                      <Text style={styles.feedbackText}>{selectedSubmission.feedback}</Text>
                    </View>
                  </View>
                )}

                {selectedSubmission.status === 'needs_edits' && (
                  <View style={styles.actionNeededBox}>
                    <AlertCircle size={20} color={Colors.dark.warning} />
                    <View style={styles.actionNeededContent}>
                      <Text style={styles.actionNeededTitle}>Action Required</Text>
                      <Text style={styles.actionNeededText}>
                        Please review the feedback above and resubmit your content with the requested changes.
                      </Text>
                    </View>
                  </View>
                )}

                {selectedSubmission.notes && (
                  <View style={styles.notesSection}>
                    <Text style={styles.inputLabel}>Your Notes</Text>
                    <View style={styles.notesBox}>
                      <Text style={styles.notesText}>{selectedSubmission.notes}</Text>
                    </View>
                  </View>
                )}

                {(selectedSubmission.status === 'pending' || selectedSubmission.status === 'needs_edits') && (
                  <PressableScale
                    style={styles.editSubmissionBtn}
                    onPress={() => openEditModal(selectedSubmission)}
                  >
                    <Edit3 size={16} color={Colors.dark.primary} />
                    <Text style={styles.editSubmissionText}>Edit Submission</Text>
                  </PressableScale>
                )}

                <View style={styles.modalBottomPadding} />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsEditModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Edit Submission</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.editFormSection}>
              <Text style={styles.inputLabel}>Platform</Text>
              <View style={styles.editPlatformsRow}>
                {(['twitter', 'instagram', 'tiktok', 'youtube', 'facebook', 'telegram'] as Platform[]).map((platform) => (
                  <PressableScale
                    key={platform}
                    style={[styles.editPlatformChip, editPlatform === platform && styles.editPlatformChipActive]}
                    onPress={() => setEditPlatform(platform)}
                    hapticType="selection"
                  >
                    <PlatformBadge platform={platform} />
                  </PressableScale>
                ))}
              </View>

              <Text style={styles.inputLabel}>Post URL</Text>
              <TextInput
                style={styles.feedbackInput}
                value={editPostUrl}
                onChangeText={setEditPostUrl}
                autoCapitalize="none"
                placeholder="https://..."
                placeholderTextColor={Colors.dark.textMuted}
              />

              <Text style={styles.inputLabel}>Notes</Text>
              <TextInput
                style={[styles.feedbackInput, styles.notesInput]}
                value={editNotes}
                onChangeText={setEditNotes}
                multiline
                placeholder="Optional notes for reviewer"
                placeholderTextColor={Colors.dark.textMuted}
              />

              <PressableScale
                style={[styles.approveBtn, isEditingSubmission && styles.btnDisabled]}
                onPress={handleSaveEdits}
                disabled={isEditingSubmission}
              >
                <CheckCircle size={18} color="#FFF" />
                <Text style={styles.approveBtnText}>{isEditingSubmission ? 'Saving...' : 'Save Changes'}</Text>
              </PressableScale>
            </View>
            <View style={styles.modalBottomPadding} />
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

export default function SubmissionsScreen() {
  const { isAdmin } = useAuth();

  if (isAdmin) {
    return <AdminReviewScreen />;
  }

  return <UserSubmissionsScreen />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  backBtnText: {
    color: Colors.dark.textSecondary,
    fontSize: 12,
    fontWeight: '600' as const,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  headerStats: {
    flexDirection: 'row',
    gap: 8,
  },
  statBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.warning + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.warning,
  },
  tabsContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  tabsScroll: {
    gap: 8,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  tabActive: {
    backgroundColor: Colors.dark.primary + '20',
    borderColor: Colors.dark.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark.textMuted,
  },
  tabTextActive: {
    color: Colors.dark.primary,
  },
  tabBadge: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  tabBadgeActive: {
    backgroundColor: Colors.dark.primary,
  },
  tabBadgeText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.textMuted,
  },
  tabBadgeTextActive: {
    color: '#FFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  submissionCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  submissionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  submissionMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  scoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  scoreText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark.warning,
  },
  submissionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  submissionCampaign: {
    fontSize: 13,
    color: Colors.dark.primary,
    marginBottom: 12,
  },
  submissionInfo: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  infoText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  feedbackPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark.warning + '15',
    padding: 10,
    borderRadius: 10,
    marginBottom: 12,
  },
  feedbackPreviewText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.warning,
  },
  viewPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary + '15',
    paddingVertical: 10,
    borderRadius: 10,
  },
  viewPostText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
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
  modalTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  submissionPreview: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  openLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  openLinkText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  previewCampaign: {
    fontSize: 14,
    color: Colors.dark.primary,
    marginBottom: 8,
  },
  previewUser: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
  },
  notesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: Colors.dark.surfaceLight,
    padding: 12,
    borderRadius: 10,
    marginTop: 12,
  },
  notesText: {
    flex: 1,
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  ratingSection: {
    marginBottom: 24,
  },
  ratingSectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  ratingSectionSubtitle: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    marginBottom: 16,
  },
  criteriaRow: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  criteriaInfo: {
    marginBottom: 10,
  },
  criteriaLabel: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  criteriaDescription: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  pointsRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  pointOption: {
    minWidth: 44,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: Colors.dark.surfaceLight,
    alignItems: 'center',
  },
  pointOptionActive: {
    backgroundColor: Colors.dark.primary,
  },
  pointOptionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.textMuted,
  },
  pointOptionTextActive: {
    color: '#FFF',
  },
  criteriaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  criteriaPoints: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark.primary,
  },
  engagementInfo: {
    backgroundColor: Colors.dark.surfaceLight,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  engagementGuide: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
  },
  metricsSection: {
    marginBottom: 24,
  },
  bonusRow: {
    marginTop: 8,
  },
  bonusSlider: {
    flexDirection: 'row',
    gap: 8,
  },
  bonusOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
  },
  bonusOptionActive: {
    backgroundColor: Colors.dark.primary + '20',
    borderColor: Colors.dark.primary,
  },
  bonusOptionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.textMuted,
  },
  bonusOptionTextActive: {
    color: Colors.dark.primary,
  },
  totalScoreBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.dark.primary + '15',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
  },
  totalScoreLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  totalScoreValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.primary,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  input: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  feedbackInput: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    fontSize: 15,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginBottom: 14,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 12,
  },
  rejectBtn: {
    backgroundColor: Colors.dark.error + '15',
  },
  rejectBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.error,
  },
  editsBtn: {
    backgroundColor: Colors.dark.warning + '15',
  },
  editsBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.warning,
  },
  approveBtn: {
    backgroundColor: Colors.dark.success,
  },
  approveBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  modalBottomPadding: {
    height: 40,
  },
  ratingDisplay: {
    marginBottom: 24,
  },
  feedbackSection: {
    marginBottom: 24,
  },
  feedbackBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.dark.primary + '15',
    padding: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  feedbackText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.text,
    lineHeight: 20,
  },
  actionNeededBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: Colors.dark.warning + '15',
    padding: 16,
    borderRadius: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: Colors.dark.warning + '40',
  },
  actionNeededContent: {
    flex: 1,
  },
  actionNeededTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.warning,
    marginBottom: 4,
  },
  actionNeededText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  notesSection: {
    marginBottom: 24,
  },
  editSubmissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.dark.primary + '15',
    borderWidth: 1,
    borderColor: Colors.dark.primary + '40',
    borderRadius: 12,
    paddingVertical: 12,
    marginBottom: 20,
  },
  editSubmissionText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  editFormSection: {
    paddingBottom: 8,
  },
  editPlatformsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  editPlatformChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  editPlatformChipActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  resetSubmissionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    marginTop: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderStyle: 'dashed',
  },
  resetSubmissionText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  twitterMetricsContainer: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  twitterMetricsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  twitterMetricsTitle: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  fetchMetricsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  fetchMetricsBtnDisabled: {
    opacity: 0.5,
  },
  fetchMetricsText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  twitterWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark.warning + '15',
    padding: 10,
    borderRadius: 8,
  },
  twitterWarningText: {
    fontSize: 12,
    color: Colors.dark.warning,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
  },
  metricsHelpText: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: 12,
  },
  metricsInputGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  metricInputCard: {
    width: '47%',
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 10,
    padding: 10,
  },
  metricInputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  metricInputLabel: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  metricInput: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
});
