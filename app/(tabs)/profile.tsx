import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import Image from '@/components/StableImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Edit3, Award, TrendingUp, FileCheck, ExternalLink, ChevronRight, ChevronLeft, X, Save, User as UserIcon, LogOut, Star, Mail, MessageCircle, Circle, CheckCircle, Lock, Eye, EyeOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp, useUserSubmissions } from '@/contexts/AppContext';
import { AVATAR_PRESETS, normalizeAvatarUri } from '@/constants/avatarPresets';

import { useAuth } from '@/contexts/AuthContext';
import StatCard from '@/components/StatCard';
import StatusBadge from '@/components/StatusBadge';
import PlatformBadge from '@/components/PlatformBadge';
import PressableScale from '@/components/PressableScale';
import EmptyState from '@/components/EmptyState';

type TabType = 'submissions' | 'stats';

export default function ProfileScreen() {
  const router = useRouter();
  const { isRefreshing, refreshData } = useApp();
  const { currentUser, logout, changePassword, updateProfile } = useAuth();
  const sortedSubmissions = useUserSubmissions(currentUser?.id);
  const [activeTab, setActiveTab] = useState<TabType>('submissions');
  const [isEditModalVisible, setIsEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(currentUser?.name || '');
  const [editTwitter, setEditTwitter] = useState(currentUser?.handles?.twitter || '');
  const [editInstagram, setEditInstagram] = useState(currentUser?.handles?.instagram || '');
  const [editTiktok, setEditTiktok] = useState(currentUser?.handles?.tiktok || '');
  const [editDiscord, setEditDiscord] = useState(currentUser?.handles?.discord || '');
  const [editFslEmail, setEditFslEmail] = useState(currentUser?.fslEmail || '');
  const [editAvatar, setEditAvatar] = useState(normalizeAvatarUri(currentUser?.avatar));
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);

  const handleRefresh = useCallback(() => {
    refreshData();
  }, [refreshData]);

  const openEditModal = useCallback(() => {
    if (!currentUser) return;
    setEditName(currentUser.name);
    setEditTwitter(currentUser.handles?.twitter || '');
    setEditInstagram(currentUser.handles?.instagram || '');
    setEditTiktok(currentUser.handles?.tiktok || '');
    setEditDiscord(currentUser.handles?.discord || '');
    setEditFslEmail(currentUser.fslEmail || '');
    setEditAvatar(normalizeAvatarUri(currentUser.avatar));
    setIsEditModalVisible(true);
  }, [currentUser]);

  const handleLogout = useCallback(() => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await logout();
            router.replace('/login');
          },
        },
      ]
    );
  }, [logout, router]);

  const openPostUrl = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      Alert.alert('Error', 'Could not open link');
    });
  }, []);

  const handleSaveProfile = useCallback(async () => {
    if (!currentUser) return;

    if (!editName.trim()) {
      Alert.alert('Error', 'Name cannot be empty');
      return;
    }

    setIsSavingProfile(true);

    const cleanHandle = (value: string) => {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    };

    const result = await updateProfile({
      name: editName.trim(),
      avatar: normalizeAvatarUri(editAvatar.trim() || currentUser.avatar),
      fslEmail: cleanHandle(editFslEmail),
      handles: {
        twitter: cleanHandle(editTwitter),
        instagram: cleanHandle(editInstagram),
        tiktok: cleanHandle(editTiktok),
        discord: cleanHandle(editDiscord),
      },
    });

    setIsSavingProfile(false);

    if (!result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to update profile');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsEditModalVisible(false);
    Alert.alert('Success', 'Profile updated successfully!');
  }, [currentUser, editAvatar, editDiscord, editFslEmail, editInstagram, editName, editTiktok, editTwitter, updateProfile]);

  const selectRelativeAvatar = useCallback((direction: -1 | 1) => {
    const current = normalizeAvatarUri(editAvatar);
    const currentIndex = AVATAR_PRESETS.findIndex((preset) => preset.uri === current);
    const safeIndex = currentIndex >= 0 ? currentIndex : 0;
    const nextIndex = (safeIndex + direction + AVATAR_PRESETS.length) % AVATAR_PRESETS.length;
    setEditAvatar(AVATAR_PRESETS[nextIndex].uri);
  }, [editAvatar]);

  const openPasswordModal = useCallback(() => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrentPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setIsPasswordModalVisible(true);
  }, []);

  const handleChangePassword = useCallback(async () => {
    if (!currentPassword.trim()) {
      Alert.alert('Error', 'Please enter your current password');
      return;
    }
    if (!newPassword.trim()) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }
    if (!currentUser) return;

    setIsChangingPassword(true);
    const result = await changePassword(currentUser.id, newPassword, currentPassword);
    setIsChangingPassword(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsPasswordModalVisible(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Success', 'Your password has been changed successfully!');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to change password');
    }
  }, [currentPassword, newPassword, confirmPassword, currentUser, changePassword]);

  if (!currentUser) {
    return null;
  }

  const user = currentUser;
  const selectedAvatar = AVATAR_PRESETS.find((preset) => preset.uri === normalizeAvatarUri(editAvatar || user.avatar)) || AVATAR_PRESETS[0];

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
          <View style={styles.headerActions}>
            <PressableScale style={styles.iconBtn} onPress={openEditModal} testID="edit-profile-btn">
              <Edit3 size={20} color={Colors.dark.text} />
            </PressableScale>
            <PressableScale style={styles.iconBtn} onPress={handleLogout} testID="logout-btn">
              <LogOut size={20} color={Colors.dark.error} />
            </PressableScale>
          </View>

          <View style={styles.profileSection}>
            <Image source={normalizeAvatarUri(user.avatar)} style={styles.avatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
            <Text style={styles.userName} testID="profile-name">{user.name}</Text>
            <Text style={styles.userRole}>{user.role.charAt(0).toUpperCase() + user.role.slice(1).replace('_', ' ')} • {user.region}</Text>
            
            <View style={styles.rankContainer}>
              <View style={styles.rankBadge}>
                <Award size={18} color={Colors.dark.warning} />
                <Text style={styles.rankText}>Rank #{user.rank}</Text>
              </View>
              <View style={styles.pointsBadge}>
                <Text style={styles.pointsValue}>{user.points.toLocaleString()}</Text>
                <Text style={styles.pointsLabel}>Points</Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.securitySection}>
          <Text style={styles.sectionTitle}>Security</Text>
          <PressableScale style={styles.changePasswordBtn} onPress={openPasswordModal} testID="change-password-btn">
            <View style={styles.changePasswordLeft}>
              <View style={styles.lockIconContainer}>
                <Lock size={18} color={Colors.dark.primary} />
              </View>
              <View>
                <Text style={styles.changePasswordTitle}>Change Password</Text>
                <Text style={styles.changePasswordSubtitle}>Update your account password</Text>
              </View>
            </View>
            <ChevronRight size={20} color={Colors.dark.textMuted} />
          </PressableScale>
        </View>

        <View style={styles.handlesSection}>
          <Text style={styles.sectionTitle}>Connected Accounts</Text>
          <View style={styles.handlesList}>
            {user.handles?.twitter && (
              <View style={styles.handleItem}>
                <PlatformBadge platform="twitter" />
                <Text style={styles.handleText}>{user.handles.twitter}</Text>
                <ChevronRight size={16} color={Colors.dark.textMuted} />
              </View>
            )}
            {user.handles?.instagram && (
              <View style={styles.handleItem}>
                <PlatformBadge platform="instagram" />
                <Text style={styles.handleText}>{user.handles.instagram}</Text>
                <ChevronRight size={16} color={Colors.dark.textMuted} />
              </View>
            )}
            {user.handles?.tiktok && (
              <View style={styles.handleItem}>
                <PlatformBadge platform="tiktok" />
                <Text style={styles.handleText}>{user.handles.tiktok}</Text>
                <ChevronRight size={16} color={Colors.dark.textMuted} />
              </View>
            )}
            {user.handles?.discord && (
              <View style={styles.handleItem}>
                <View style={styles.discordBadge}>
                  <MessageCircle size={14} color="#5865F2" />
                </View>
                <Text style={styles.handleText}>{user.handles.discord}</Text>
                <ChevronRight size={16} color={Colors.dark.textMuted} />
              </View>
            )}
            {user.fslEmail && (
              <View style={styles.handleItem}>
                <View style={styles.fslBadge}>
                  <Mail size={14} color={Colors.dark.primary} />
                </View>
                <Text style={styles.handleText}>{user.fslEmail}</Text>
                <ChevronRight size={16} color={Colors.dark.textMuted} />
              </View>
            )}
            {!user.handles?.twitter && !user.handles?.instagram && !user.handles?.tiktok && !user.handles?.discord && !user.fslEmail && (
              <PressableScale style={styles.addHandleBtn} onPress={openEditModal}>
                <Text style={styles.addHandleText}>+ Add social accounts</Text>
              </PressableScale>
            )}
          </View>
        </View>

        <View style={styles.tabsWrapper}>
          <View style={styles.tabsContainer}>
            <PressableScale 
              style={[styles.tabCard, activeTab === 'submissions' && styles.tabCardActive]}
              onPress={() => setActiveTab('submissions')}
              hapticType="selection"
            >
              <View style={styles.tabCardIndicator}>
                {activeTab === 'submissions' ? (
                  <CheckCircle size={18} color={Colors.dark.primary} />
                ) : (
                  <Circle size={18} color={Colors.dark.textMuted} />
                )}
              </View>
              <FileCheck size={22} color={activeTab === 'submissions' ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.tabCardTitle, activeTab === 'submissions' && styles.tabCardTitleActive]}>
                Submissions
              </Text>
              <Text style={styles.tabCardSubtitle}>View your posts</Text>
            </PressableScale>
            <PressableScale 
              style={[styles.tabCard, activeTab === 'stats' && styles.tabCardActive]}
              onPress={() => setActiveTab('stats')}
              hapticType="selection"
            >
              <View style={styles.tabCardIndicator}>
                {activeTab === 'stats' ? (
                  <CheckCircle size={18} color={Colors.dark.primary} />
                ) : (
                  <Circle size={18} color={Colors.dark.textMuted} />
                )}
              </View>
              <TrendingUp size={22} color={activeTab === 'stats' ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.tabCardTitle, activeTab === 'stats' && styles.tabCardTitleActive]}>
                Performance
              </Text>
              <Text style={styles.tabCardSubtitle}>Stats & metrics</Text>
            </PressableScale>
          </View>
        </View>

        {activeTab === 'submissions' ? (
          <View style={styles.contentSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>Your Submissions</Text>
              <Text style={styles.sectionHeaderSubtitle}>{sortedSubmissions.length} total</Text>
            </View>
            {sortedSubmissions.length === 0 ? (
              <EmptyState
                icon={FileCheck}
                title="No submissions yet"
                message="Complete tasks to see your submissions here"
              />
            ) : (
              sortedSubmissions.map((submission) => (
                <View key={submission.id} style={styles.submissionCard}>
                  <View style={styles.submissionHeader}>
                    <PlatformBadge platform={submission.platform} />
                    <StatusBadge status={submission.status} />
                  </View>
                  
                  <Text style={styles.submissionTitle}>{submission.taskTitle}</Text>
                  <Text style={styles.submissionCampaign}>{submission.campaignTitle}</Text>
                  
                  {submission.feedback && (
                    <View style={styles.feedbackBox}>
                      <Text style={styles.feedbackLabel}>Feedback:</Text>
                      <Text style={styles.feedbackText}>{submission.feedback}</Text>
                    </View>
                  )}

                  {submission.rating && (
                    <View style={styles.ratingBox}>
                      <View style={styles.ratingHeader}>
                        <Star size={16} color={Colors.dark.warning} />
                        <Text style={styles.ratingScore}>{submission.rating.totalScore}/100</Text>
                      </View>
                      <View style={styles.ratingBreakdown}>
                        <Text style={styles.ratingItem}>Relevance: {submission.rating.relevanceToTask}/25</Text>
                        <Text style={styles.ratingItem}>Creativity: {submission.rating.creativity}/15</Text>
                        <Text style={styles.ratingItem}>Engagement: {submission.rating.engagementScore}/20</Text>
                      </View>
                    </View>
                  )}

                  {submission.metrics && (
                    <View style={styles.metricsRow}>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{(submission.metrics.impressions / 1000).toFixed(1)}K</Text>
                        <Text style={styles.metricLabel}>Views</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{submission.metrics.likes}</Text>
                        <Text style={styles.metricLabel}>Likes</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{submission.metrics.comments}</Text>
                        <Text style={styles.metricLabel}>Comments</Text>
                      </View>
                      <View style={styles.metricItem}>
                        <Text style={styles.metricValue}>{submission.metrics.shares}</Text>
                        <Text style={styles.metricLabel}>Shares</Text>
                      </View>
                    </View>
                  )}

                  <View style={styles.submissionFooter}>
                    <Text style={styles.submissionDate}>
                      Submitted {new Date(submission.submittedAt).toLocaleDateString()}
                    </Text>
                    <PressableScale style={styles.viewPostBtn} onPress={() => openPostUrl(submission.postUrl)}>
                      <ExternalLink size={14} color={Colors.dark.primary} />
                      <Text style={styles.viewPostText}>View Post</Text>
                    </PressableScale>
                  </View>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.contentSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderTitle}>Performance Stats</Text>
              <Text style={styles.sectionHeaderSubtitle}>All time</Text>
            </View>
            <View style={styles.statsGrid}>
              <StatCard label="Total Posts" value={user.stats.totalPosts} color={Colors.dark.primary} />
              <StatCard label="Tasks Done" value={user.stats.completedTasks} color={Colors.dark.success} />
            </View>
            <View style={styles.statsGrid}>
              <StatCard label="Impressions" value={user.stats.totalImpressions} color={Colors.dark.secondary} />
              <StatCard label="Total Likes" value={user.stats.totalLikes} color={Colors.dark.accent} />
            </View>
            <View style={styles.statsGrid}>
              <StatCard label="Retweets" value={user.stats.totalRetweets} color={Colors.dark.warning} />
              <StatCard label="Avg Engagement" value="3.2%" color={Colors.dark.error} />
            </View>
            
            <View style={styles.memberSince}>
              <Text style={styles.memberSinceText}>
                Member since {new Date(user.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isEditModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsEditModalVisible(false)} testID="close-modal">
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Edit Profile</Text>
            <PressableScale onPress={handleSaveProfile} testID="save-profile">
              <Save size={24} color={Colors.dark.primary} />
            </PressableScale>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.avatarSection}>
              <Image source={normalizeAvatarUri(editAvatar || user.avatar)} style={styles.editAvatar} contentFit="cover" cachePolicy="memory-disk" transition={0} />
              <Text style={styles.inputLabel}>Choose Avatar</Text>
              <View style={styles.avatarPagerRow}>
                <PressableScale style={styles.avatarPagerBtn} onPress={() => selectRelativeAvatar(-1)} hapticType="selection">
                  <ChevronLeft size={16} color={Colors.dark.primary} />
                  <Text style={styles.avatarPagerBtnText}>Prev</Text>
                </PressableScale>
                <Text style={styles.avatarPagerLabel}>{selectedAvatar.label}</Text>
                <PressableScale style={styles.avatarPagerBtn} onPress={() => selectRelativeAvatar(1)} hapticType="selection">
                  <Text style={styles.avatarPagerBtnText}>Next</Text>
                  <ChevronRight size={16} color={Colors.dark.primary} />
                </PressableScale>
              </View>
              <View style={styles.avatarPresetGrid}>
                {AVATAR_PRESETS.map((preset) => {
                  const selected = normalizeAvatarUri(editAvatar) === preset.uri;
                  return (
                    <PressableScale
                      key={preset.id}
                      style={[styles.avatarPresetCard, selected && styles.avatarPresetCardActive]}
                      onPress={() => setEditAvatar(preset.uri)}
                    >
                      <Image source={preset.uri} style={styles.avatarPresetImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                      <Text style={[styles.avatarPresetLabel, selected && styles.avatarPresetLabelActive]}>
                        {preset.label}
                      </Text>
                    </PressableScale>
                  );
                })}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Display Name</Text>
              <View style={styles.inputContainer}>
                <UserIcon size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={editName}
                  onChangeText={setEditName}
                  placeholder="Your name"
                  placeholderTextColor={Colors.dark.textMuted}
                  testID="edit-name-input"
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Social Handles</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>X (Twitter)</Text>
              <View style={styles.inputContainer}>
                <PlatformBadge platform="twitter" size="small" />
                <TextInput
                  style={styles.input}
                  value={editTwitter}
                  onChangeText={setEditTwitter}
                  placeholder="@username"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  testID="edit-twitter-input"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Instagram</Text>
              <View style={styles.inputContainer}>
                <PlatformBadge platform="instagram" size="small" />
                <TextInput
                  style={styles.input}
                  value={editInstagram}
                  onChangeText={setEditInstagram}
                  placeholder="@username"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  testID="edit-instagram-input"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>TikTok</Text>
              <View style={styles.inputContainer}>
                <PlatformBadge platform="tiktok" size="small" />
                <TextInput
                  style={styles.input}
                  value={editTiktok}
                  onChangeText={setEditTiktok}
                  placeholder="@username"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  testID="edit-tiktok-input"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Discord Username</Text>
              <View style={styles.inputContainer}>
                <MessageCircle size={18} color="#5865F2" />
                <TextInput
                  style={styles.input}
                  value={editDiscord}
                  onChangeText={setEditDiscord}
                  placeholder="username#1234"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  testID="edit-discord-input"
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>FSL Information</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>FSL ID Email</Text>
              <View style={styles.inputContainer}>
                <Mail size={18} color={Colors.dark.primary} />
                <TextInput
                  style={styles.input}
                  value={editFslEmail}
                  onChangeText={setEditFslEmail}
                  placeholder="your.fsl@email.com"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  testID="edit-fsl-email-input"
                />
              </View>
            </View>

            <PressableScale style={[styles.saveButton, isSavingProfile && styles.saveButtonDisabled]} onPress={handleSaveProfile} hapticType="medium" disabled={isSavingProfile}>
              <Text style={styles.saveButtonText}>Save Changes</Text>
            </PressableScale>

            <View style={styles.modalBottomPadding} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isPasswordModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView 
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsPasswordModalVisible(false)} testID="close-password-modal">
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Change Password</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.passwordHeader}>
              <View style={styles.passwordIconLarge}>
                <Lock size={32} color={Colors.dark.primary} />
              </View>
              <Text style={styles.passwordHeaderTitle}>Update Your Password</Text>
              <Text style={styles.passwordHeaderSubtitle}>
                Enter your current password and choose a new one
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Current Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={currentPassword}
                  onChangeText={setCurrentPassword}
                  placeholder="Enter current password"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showCurrentPassword}
                  autoCapitalize="none"
                  testID="current-password-input"
                />
                <PressableScale onPress={() => setShowCurrentPassword(!showCurrentPassword)}>
                  {showCurrentPassword ? (
                    <EyeOff size={20} color={Colors.dark.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.dark.textMuted} />
                  )}
                </PressableScale>
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={newPassword}
                  onChangeText={setNewPassword}
                  placeholder="Enter new password"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showNewPassword}
                  autoCapitalize="none"
                  testID="new-password-input"
                />
                <PressableScale onPress={() => setShowNewPassword(!showNewPassword)}>
                  {showNewPassword ? (
                    <EyeOff size={20} color={Colors.dark.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.dark.textMuted} />
                  )}
                </PressableScale>
              </View>
              <Text style={styles.passwordHint}>Must be at least 6 characters</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm New Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  testID="confirm-password-input"
                />
                <PressableScale onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                  {showConfirmPassword ? (
                    <EyeOff size={20} color={Colors.dark.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.dark.textMuted} />
                  )}
                </PressableScale>
              </View>
            </View>

            <PressableScale 
              style={[
                styles.saveButton, 
                isChangingPassword && styles.saveButtonDisabled
              ]} 
              onPress={handleChangePassword} 
              hapticType="medium"
              disabled={isChangingPassword}
            >
              <Text style={styles.saveButtonText}>
                {isChangingPassword ? 'Changing Password...' : 'Change Password'}
              </Text>
            </PressableScale>

            <View style={styles.modalBottomPadding} />
          </ScrollView>
        </KeyboardAvoidingView>
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
    padding: 20,
  },
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginBottom: 20,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  profileSection: {
    alignItems: 'center',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 3,
    borderColor: Colors.dark.primary,
    marginBottom: 16,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  userRole: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginBottom: 16,
  },
  rankContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.warning + '20',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
  },
  rankText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.warning,
  },
  pointsBadge: {
    alignItems: 'center',
    backgroundColor: Colors.dark.primary + '20',
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 12,
  },
  pointsValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.primary,
  },
  pointsLabel: {
    fontSize: 10,
    color: Colors.dark.textMuted,
  },
  handlesSection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 12,
  },
  handlesList: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    overflow: 'hidden',
  },
  handleItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  handleText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textSecondary,
  },
  discordBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#5865F2' + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fslBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: Colors.dark.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addHandleBtn: {
    padding: 16,
    alignItems: 'center',
  },
  addHandleText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: '600' as const,
  },
  tabsWrapper: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  tabsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  tabCard: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.dark.border,
    position: 'relative' as const,
  },
  tabCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '10',
  },
  tabCardIndicator: {
    position: 'absolute' as const,
    top: 10,
    left: 10,
  },
  tabCardTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.textMuted,
    marginTop: 8,
  },
  tabCardTitleActive: {
    color: Colors.dark.primary,
    fontWeight: '700' as const,
  },
  tabCardSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 4,
  },
  contentSection: {
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.dark.border,
  },
  sectionHeaderTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  sectionHeaderSubtitle: {
    fontSize: 14,
    color: Colors.dark.textMuted,
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
  feedbackBox: {
    backgroundColor: Colors.dark.accent + '15',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.dark.accent,
  },
  feedbackLabel: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.accent,
    marginBottom: 4,
  },
  feedbackText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    lineHeight: 18,
  },
  ratingBox: {
    backgroundColor: Colors.dark.warning + '10',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.warning + '30',
  },
  ratingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  ratingScore: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.warning,
  },
  ratingBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  ratingItem: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  metricItem: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  metricLabel: {
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  submissionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  submissionDate: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  viewPostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  viewPostText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  memberSince: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  memberSinceText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
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
  avatarSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  editAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 12,
  },
  avatarPresetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    width: '100%',
    justifyContent: 'space-between',
  },
  avatarPagerRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  avatarPagerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  avatarPagerBtnText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  avatarPagerLabel: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  avatarPresetCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    width: '23%',
  },
  avatarPresetCardActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '15',
  },
  avatarPresetImage: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: 6,
  },
  avatarPresetLabel: {
    fontSize: 11,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  avatarPresetLabelActive: {
    color: Colors.dark.primary,
  },
  sectionLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 16,
    marginTop: 8,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surface,
    borderRadius: 12,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.dark.text,
  },
  saveButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  modalBottomPadding: {
    height: 40,
  },
  securitySection: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  changePasswordBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  changePasswordLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  lockIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  changePasswordTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.text,
  },
  changePasswordSubtitle: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 2,
  },
  passwordHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  passwordIconLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  passwordHeaderTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 8,
  },
  passwordHeaderSubtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  passwordHint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 6,
    marginLeft: 4,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
});
