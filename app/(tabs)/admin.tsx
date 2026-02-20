import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, Modal, RefreshControl, KeyboardAvoidingView, Platform, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { UserPlus, Users, Shield, Clock, CheckCircle, XCircle, Copy, Mail, MapPin, X, Send, Trash2, Key, Eye, EyeOff } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { regions } from '@/mocks/data';
import { Season, UserRole, UserStatus } from '@/types';
import { DEFAULT_AVATAR_URI } from '@/constants/avatarPresets';
import PressableScale from '@/components/PressableScale';
import EmptyState from '@/components/EmptyState';
import { trpcClient } from '@/lib/trpc';

type FilterTab = 'all' | 'pending' | 'active' | 'suspended';

export default function AdminScreen() {
  const router = useRouter();
  const { users, currentUser, isAdmin, createUser, updateUserStatus, deleteUser, changePassword, refreshUsers } = useAuth();
  const { refreshData: refreshAppData } = useApp();
  const [activeTab, setActiveTab] = useState<FilterTab>('all');
  const [isCreateModalVisible, setIsCreateModalVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRegion, setNewUserRegion] = useState(regions[0]);
  const [newUserRole, setNewUserRole] = useState<UserRole>('ambassador');
  const [isCreating, setIsCreating] = useState(false);
  const [lastCreatedInvite, setLastCreatedInvite] = useState<string | null>(null);
  
  const [isResetPasswordModalVisible, setIsResetPasswordModalVisible] = useState(false);
  const [selectedUserForReset, setSelectedUserForReset] = useState<{ id: string; name: string } | null>(null);
  const [newPasswordForReset, setNewPasswordForReset] = useState('');
  const [confirmPasswordForReset, setConfirmPasswordForReset] = useState('');
  const [showNewPasswordReset, setShowNewPasswordReset] = useState(false);
  const [showConfirmPasswordReset, setShowConfirmPasswordReset] = useState(false);
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [isSeasonLoading, setIsSeasonLoading] = useState(false);
  const [isClosingSeason, setIsClosingSeason] = useState(false);
  const [isEditUserModalVisible, setIsEditUserModalVisible] = useState(false);
  const [selectedUserForEdit, setSelectedUserForEdit] = useState<{ id: string; name: string } | null>(null);
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserUsername, setEditUserUsername] = useState('');
  const [editUserRegion, setEditUserRegion] = useState('');
  const [isSavingUserEdit, setIsSavingUserEdit] = useState(false);

  const filteredUsers = users.filter(u => {
    if (u.id === currentUser?.id) return false;
    if (activeTab === 'all') return true;
    return u.status === activeTab;
  });

  const loadCurrentSeason = useCallback(async () => {
    try {
      setIsSeasonLoading(true);
      const season = await trpcClient.seasons.getCurrent.query();
      setCurrentSeason(season);
    } catch (error) {
      console.log('[Admin] Failed to load current season:', error);
    } finally {
      setIsSeasonLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentSeason();
  }, [loadCurrentSeason]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshUsers(), loadCurrentSeason(), refreshAppData()]);
    } catch (error) {
      console.log('[Admin] Refresh error:', error);
    } finally {
      setIsRefreshing(false);
    }
  }, [refreshUsers, loadCurrentSeason, refreshAppData]);

  const handleCreateUser = useCallback(async () => {
    if (!newUserName.trim() || !newUserEmail.trim()) {
      Alert.alert('Error', 'Please fill in name and email');
      return;
    }

    if (!newUserEmail.includes('@')) {
      Alert.alert('Error', 'Please enter a valid email address');
      return;
    }

    setIsCreating(true);
    const result = await createUser({
      name: newUserName.trim(),
      email: newUserEmail.trim().toLowerCase(),
      avatar: DEFAULT_AVATAR_URI,
      role: newUserRole,
      region: newUserRegion,
      points: 0,
      rank: 0,
      handles: {},
    });
    setIsCreating(false);

    if (result.success && result.inviteCode) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastCreatedInvite(result.inviteCode);
      setNewUserName('');
      setNewUserEmail('');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to create user');
    }
  }, [newUserName, newUserEmail, newUserRegion, newUserRole, createUser]);

  const handleCopyInvite = useCallback(async () => {
    if (lastCreatedInvite) {
      await Clipboard.setStringAsync(lastCreatedInvite);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Copied!', 'Invite code copied to clipboard');
    }
  }, [lastCreatedInvite]);

  const handleShareInvite = useCallback(async () => {
    if (lastCreatedInvite) {
      try {
        await Share.share({
          message: `Welcome to Ambassador Platform! Your invite code is: ${lastCreatedInvite}\n\nUse this code along with your email to activate your account.`,
        });
      } catch (error) {
        console.log('Share error:', error);
      }
    }
  }, [lastCreatedInvite]);

  const handleStatusChange = useCallback(async (userId: string, newStatus: UserStatus) => {
    const user = users.find(u => u.id === userId);
    const statusText = newStatus === 'active' ? 'activate' : newStatus === 'suspended' ? 'suspend' : 'set to pending';
    
    Alert.alert(
      'Confirm Action',
      `Are you sure you want to ${statusText} ${user?.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: newStatus === 'suspended' ? 'destructive' : 'default',
          onPress: async () => {
            const result = await updateUserStatus(userId, newStatus);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', result.error);
            }
          }
        }
      ]
    );
  }, [users, updateUserStatus]);

  const handleDeleteUser = useCallback(async (userId: string) => {
    const user = users.find(u => u.id === userId);
    
    Alert.alert(
      'Delete User',
      `Are you sure you want to permanently delete ${user?.name}? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const result = await deleteUser(userId);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', result.error);
            }
          }
        }
      ]
    );
  }, [users, deleteUser]);

  const openResetPasswordModal = useCallback((userId: string, userName: string) => {
    setSelectedUserForReset({ id: userId, name: userName });
    setNewPasswordForReset('');
    setConfirmPasswordForReset('');
    setShowNewPasswordReset(false);
    setShowConfirmPasswordReset(false);
    setIsResetPasswordModalVisible(true);
  }, []);

  const openEditUserModal = useCallback((userId: string, userName: string, email: string, username?: string, region?: string) => {
    setSelectedUserForEdit({ id: userId, name: userName });
    setEditUserEmail(email || '');
    setEditUserUsername(username || '');
    setEditUserRegion(region || '');
    setIsEditUserModalVisible(true);
  }, []);

  const handleSaveUserEdit = useCallback(async () => {
    if (!selectedUserForEdit) return;
    if (!editUserEmail.trim() || !editUserEmail.includes('@')) {
      Alert.alert('Error', 'Valid email is required');
      return;
    }
    if (!editUserRegion.trim()) {
      Alert.alert('Error', 'Region is required');
      return;
    }

    setIsSavingUserEdit(true);
    try {
      await trpcClient.users.update.mutate({
        id: selectedUserForEdit.id,
        email: editUserEmail.trim().toLowerCase(),
        username: editUserUsername.trim() || undefined,
        region: editUserRegion.trim(),
      });
      await Promise.all([refreshUsers(), refreshAppData()]);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsEditUserModalVisible(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update user';
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', message);
    } finally {
      setIsSavingUserEdit(false);
    }
  }, [selectedUserForEdit, editUserEmail, editUserUsername, editUserRegion, refreshUsers, refreshAppData]);

  const handleResetPassword = useCallback(async () => {
    if (!selectedUserForReset) return;
    
    if (!newPasswordForReset.trim()) {
      Alert.alert('Error', 'Please enter a new password');
      return;
    }
    if (newPasswordForReset.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }
    if (newPasswordForReset !== confirmPasswordForReset) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    setIsResettingPassword(true);
    const result = await changePassword(selectedUserForReset.id, newPasswordForReset);
    setIsResettingPassword(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsResetPasswordModalVisible(false);
      Alert.alert(
        'Password Reset',
        `Password for ${selectedUserForReset.name} has been reset successfully. They will be logged out of all other sessions.`
      );
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to reset password');
    }
  }, [selectedUserForReset, newPasswordForReset, confirmPasswordForReset, changePassword]);

  const closeModalAndReset = useCallback(() => {
    setIsCreateModalVisible(false);
    setLastCreatedInvite(null);
    setNewUserName('');
    setNewUserEmail('');
  }, []);

  const handleCloseSeason = useCallback(async () => {
    if (!currentUser?.id) {
      Alert.alert('Error', 'Active admin session required');
      return;
    }

    const seasonName = currentSeason?.name || 'current season';
    Alert.alert(
      'Close Season',
      `Close ${seasonName} and start a new one?\n\nThis will:\n• Reset all users' points and performance stats to zero\n• Clear approved submissions\n• Keep pending and needs_edits submissions\n• Keep tasks, assets, events, and users`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Close & Start New',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsClosingSeason(true);
              const result = await trpcClient.seasons.closeAndStartNew.mutate({
                adminUserId: currentUser.id,
              });
              await Promise.all([refreshUsers(), loadCurrentSeason(), refreshAppData()]);
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                'New Season Started',
                `${result.newSeason.name} is now active.\nReset ${result.resetUserCount} user account(s).\nCleared ${result.resetApprovedSubmissions || 0} approved submission(s).`
              );
            } catch (error) {
              const message = error instanceof Error ? error.message : 'Failed to close season';
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
              Alert.alert('Error', message);
            } finally {
              setIsClosingSeason(false);
            }
          }
        }
      ]
    );
  }, [currentUser, currentSeason, refreshUsers, loadCurrentSeason, refreshAppData]);

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <EmptyState
          icon={Shield}
          title="Admin Access Required"
          message="This section is only available to administrators."
        />
      </SafeAreaView>
    );
  }

  const getStatusColor = (status: UserStatus) => {
    switch (status) {
      case 'active': return Colors.dark.success;
      case 'pending': return Colors.dark.warning;
      case 'suspended': return Colors.dark.error;
      default: return Colors.dark.textMuted;
    }
  };

  const getStatusIcon = (status: UserStatus) => {
    switch (status) {
      case 'active': return CheckCircle;
      case 'pending': return Clock;
      case 'suspended': return XCircle;
      default: return Clock;
    }
  };

  const tabCounts = {
    all: users.filter(u => u.id !== currentUser?.id).length,
    pending: users.filter(u => u.status === 'pending').length,
    active: users.filter(u => u.status === 'active' && u.id !== currentUser?.id).length,
    suspended: users.filter(u => u.status === 'suspended').length,
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>User Management</Text>
        <PressableScale 
          style={styles.addButton} 
          onPress={() => setIsCreateModalVisible(true)}
          hapticType="medium"
          testID="add-user-btn"
        >
          <UserPlus size={20} color="#FFF" />
          <Text style={styles.addButtonText}>Add User</Text>
        </PressableScale>
      </View>

      <View style={styles.analyticsRow}>
        <PressableScale style={styles.analyticsBtn} onPress={() => router.push('/admin/analytics' as any)}>
          <Text style={styles.analyticsBtnText}>Program Analytics</Text>
        </PressableScale>
        <PressableScale style={styles.analyticsBtn} onPress={() => router.push('/admin/analytics/regions' as any)}>
          <Text style={styles.analyticsBtnText}>Regional Analytics</Text>
        </PressableScale>
      </View>

      <View style={styles.seasonCard}>
        <View style={styles.seasonHeader}>
          <Text style={styles.seasonTitle}>Season Control</Text>
          <Text style={styles.seasonValue}>
            {isSeasonLoading ? 'Loading...' : (currentSeason?.name || 'Season 1')}
          </Text>
        </View>
        <Text style={styles.seasonMeta}>
          {currentSeason?.startedAt
            ? `Started ${new Date(currentSeason.startedAt).toLocaleDateString()}`
            : 'Tracks leaderboard cycle'}
        </Text>
        <PressableScale
          style={[styles.closeSeasonBtn, isClosingSeason && styles.closeSeasonBtnDisabled]}
          onPress={handleCloseSeason}
          disabled={isClosingSeason || isSeasonLoading}
          hapticType="medium"
        >
          <Text style={styles.closeSeasonBtnText}>
            {isClosingSeason ? 'Closing Season...' : 'Close Current Season & Start New'}
          </Text>
        </PressableScale>
      </View>

      <View style={styles.tabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
          {(['all', 'pending', 'active', 'suspended'] as FilterTab[]).map((tab) => (
            <PressableScale
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}
              hapticType="selection"
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
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
            onRefresh={handleRefresh}
            tintColor={Colors.dark.primary}
          />
        }
      >
        {filteredUsers.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users found"
            message={`No ${activeTab === 'all' ? '' : activeTab} users to display`}
          />
        ) : (
          filteredUsers.map((user) => {
            const StatusIcon = getStatusIcon(user.status);
            return (
              <View key={user.id} style={styles.userCard}>
                <View style={styles.userHeader}>
                  <View style={styles.userInfo}>
                    <View style={styles.avatarContainer}>
                      <View style={[styles.statusDot, { backgroundColor: getStatusColor(user.status) }]} />
                    </View>
                    <View style={styles.userDetails}>
                      <PressableScale hapticType="selection" onPress={() => openEditUserModal(user.id, user.name, user.email, user.username, user.region)}>
                        <Text style={styles.userName}>{user.name}</Text>
                      </PressableScale>
                      <Text style={styles.userEmail}>{user.email}</Text>
                    </View>
                  </View>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(user.status) + '20' }]}>
                    <StatusIcon size={14} color={getStatusColor(user.status)} />
                    <Text style={[styles.statusText, { color: getStatusColor(user.status) }]}>
                      {user.status}
                    </Text>
                  </View>
                </View>

                <View style={styles.userMeta}>
                  <View style={styles.metaItem}>
                    <Shield size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.metaText}>{user.role}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <MapPin size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.metaText}>{user.region}</Text>
                  </View>
                </View>

                {user.inviteCode && (
                  <View style={styles.inviteCodeBox}>
                    <Text style={styles.inviteCodeLabel}>Invite Code:</Text>
                    <Text style={styles.inviteCode}>{user.inviteCode}</Text>
                    <PressableScale 
                      onPress={async () => {
                        await Clipboard.setStringAsync(user.inviteCode!);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        Alert.alert('Copied', 'Invite code copied to clipboard');
                      }}
                    >
                      <Copy size={16} color={Colors.dark.primary} />
                    </PressableScale>
                  </View>
                )}

                <View style={styles.userActions}>
                  <PressableScale
                    style={[styles.actionBtn, styles.actionBtnInfo]}
                    onPress={() => openEditUserModal(user.id, user.name, user.email, user.username, user.region)}
                  >
                    <Mail size={16} color={Colors.dark.primary} />
                    <Text style={[styles.actionBtnText, { color: Colors.dark.primary }]}>Edit</Text>
                  </PressableScale>
                  {user.status === 'pending' && (
                    <PressableScale
                      style={[styles.actionBtn, styles.actionBtnSuccess]}
                      onPress={() => handleStatusChange(user.id, 'active')}
                    >
                      <CheckCircle size={16} color={Colors.dark.success} />
                      <Text style={[styles.actionBtnText, { color: Colors.dark.success }]}>Activate</Text>
                    </PressableScale>
                  )}
                  {user.status === 'active' && (
                    <>
                      <PressableScale
                        style={[styles.actionBtn, styles.actionBtnWarning]}
                        onPress={() => openResetPasswordModal(user.id, user.name)}
                      >
                        <Key size={16} color={Colors.dark.warning} />
                        <Text style={[styles.actionBtnText, { color: Colors.dark.warning }]}>Reset PW</Text>
                      </PressableScale>
                      <PressableScale
                        style={[styles.actionBtn, styles.actionBtnDanger]}
                        onPress={() => handleStatusChange(user.id, 'suspended')}
                      >
                        <XCircle size={16} color={Colors.dark.error} />
                        <Text style={[styles.actionBtnText, { color: Colors.dark.error }]}>Suspend</Text>
                      </PressableScale>
                    </>
                  )}
                  {user.status === 'suspended' && (
                    <>
                      <PressableScale
                        style={[styles.actionBtn, styles.actionBtnSuccess]}
                        onPress={() => handleStatusChange(user.id, 'active')}
                      >
                        <CheckCircle size={16} color={Colors.dark.success} />
                        <Text style={[styles.actionBtnText, { color: Colors.dark.success }]}>Reactivate</Text>
                      </PressableScale>
                      <PressableScale
                        style={[styles.actionBtn, styles.actionBtnDelete]}
                        onPress={() => handleDeleteUser(user.id)}
                      >
                        <Trash2 size={16} color="#FFF" />
                        <Text style={[styles.actionBtnText, { color: '#FFF' }]}>Delete</Text>
                      </PressableScale>
                    </>
                  )}
                </View>
              </View>
            );
          })
        )}
        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isCreateModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModalAndReset}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <PressableScale onPress={closeModalAndReset}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Add New User</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            {lastCreatedInvite ? (
              <View style={styles.successContainer}>
                <CheckCircle size={48} color={Colors.dark.success} />
                <Text style={styles.successTitle}>User Created!</Text>
                <Text style={styles.successSubtitle}>Share this invite code with the new user:</Text>
                
                <View style={styles.inviteCodeDisplay}>
                  <Text style={styles.inviteCodeLarge}>{lastCreatedInvite}</Text>
                </View>

                <View style={styles.successActions}>
                  <PressableScale style={styles.copyBtn} onPress={handleCopyInvite} hapticType="medium">
                    <Copy size={20} color={Colors.dark.primary} />
                    <Text style={styles.copyBtnText}>Copy Code</Text>
                  </PressableScale>
                  <PressableScale style={styles.shareBtn} onPress={handleShareInvite} hapticType="medium">
                    <Send size={20} color="#FFF" />
                    <Text style={styles.shareBtnText}>Share</Text>
                  </PressableScale>
                </View>

                <Text style={styles.instructionText}>
                  The user will need to enter this code along with their email address to activate their account.
                </Text>

                <PressableScale 
                  style={styles.addAnotherBtn} 
                  onPress={() => setLastCreatedInvite(null)}
                  hapticType="light"
                >
                  <UserPlus size={18} color={Colors.dark.primary} />
                  <Text style={styles.addAnotherText}>Add Another User</Text>
                </PressableScale>
              </View>
            ) : (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <View style={styles.inputContainer}>
                    <TextInput
                      style={styles.input}
                      value={newUserName}
                      onChangeText={setNewUserName}
                      placeholder="John Doe"
                      placeholderTextColor={Colors.dark.textMuted}
                      testID="new-user-name"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <View style={styles.inputContainer}>
                    <Mail size={18} color={Colors.dark.textMuted} />
                    <TextInput
                      style={styles.input}
                      value={newUserEmail}
                      onChangeText={setNewUserEmail}
                      placeholder="john.doe@fsl.com"
                      placeholderTextColor={Colors.dark.textMuted}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      testID="new-user-email"
                    />
                  </View>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Region</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
                    {regions.map((region) => (
                      <PressableScale
                        key={region}
                        style={[styles.optionChip, newUserRegion === region && styles.optionChipActive]}
                        onPress={() => setNewUserRegion(region)}
                        hapticType="selection"
                      >
                        <Text style={[styles.optionChipText, newUserRegion === region && styles.optionChipTextActive]}>
                          {region}
                        </Text>
                      </PressableScale>
                    ))}
                  </ScrollView>
                </View>

                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Role</Text>
                  <View style={styles.roleOptions}>
                    {(['ambassador', 'regional_lead', 'admin'] as UserRole[]).map((role) => (
                      <PressableScale
                        key={role}
                        style={[styles.roleOption, newUserRole === role && styles.roleOptionActive]}
                        onPress={() => setNewUserRole(role)}
                        hapticType="selection"
                      >
                        <Text style={[styles.roleOptionText, newUserRole === role && styles.roleOptionTextActive]}>
                          {role.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Text>
                      </PressableScale>
                    ))}
                  </View>
                </View>

                <PressableScale
                  style={[styles.createButton, isCreating && styles.createButtonDisabled]}
                  onPress={handleCreateUser}
                  disabled={isCreating}
                  hapticType="medium"
                  testID="create-user-btn"
                >
                  <Text style={styles.createButtonText}>
                    {isCreating ? 'Creating...' : 'Create & Generate Invite'}
                  </Text>
                </PressableScale>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isEditUserModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsEditUserModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsEditUserModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Edit Ambassador</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.resetPasswordSubtitle}>{selectedUserForEdit?.name}</Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email Address</Text>
              <View style={styles.inputContainer}>
                <Mail size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={editUserEmail}
                  onChangeText={setEditUserEmail}
                  placeholder="user@email.com"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Username</Text>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  value={editUserUsername}
                  onChangeText={setEditUserUsername}
                  placeholder="username"
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Region</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.optionScroll}>
                {regions.map((region) => (
                  <PressableScale
                    key={region}
                    style={[styles.optionChip, editUserRegion === region && styles.optionChipActive]}
                    onPress={() => setEditUserRegion(region)}
                    hapticType="selection"
                  >
                    <Text style={[styles.optionChipText, editUserRegion === region && styles.optionChipTextActive]}>
                      {region}
                    </Text>
                  </PressableScale>
                ))}
              </ScrollView>
            </View>

            <PressableScale
              style={[styles.resetButton, isSavingUserEdit && styles.resetButtonDisabled]}
              onPress={handleSaveUserEdit}
              disabled={isSavingUserEdit}
              hapticType="medium"
            >
              <Text style={styles.resetButtonText}>
                {isSavingUserEdit ? 'Saving...' : 'Save User'}
              </Text>
            </PressableScale>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={isResetPasswordModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsResetPasswordModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalContainer}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsResetPasswordModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>Reset Password</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.resetPasswordHeader}>
              <View style={styles.resetPasswordIcon}>
                <Key size={32} color={Colors.dark.warning} />
              </View>
              <Text style={styles.resetPasswordTitle}>Admin Password Reset</Text>
              <Text style={styles.resetPasswordSubtitle}>
                Reset password for {selectedUserForReset?.name}
              </Text>
              <Text style={styles.resetPasswordWarning}>
                This will log them out of all active sessions.
              </Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>New Password</Text>
              <View style={styles.inputContainer}>
                <Key size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={newPasswordForReset}
                  onChangeText={setNewPasswordForReset}
                  placeholder="Enter new password"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showNewPasswordReset}
                  autoCapitalize="none"
                />
                <PressableScale onPress={() => setShowNewPasswordReset(!showNewPasswordReset)}>
                  {showNewPasswordReset ? (
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
                <Key size={18} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={confirmPasswordForReset}
                  onChangeText={setConfirmPasswordForReset}
                  placeholder="Confirm new password"
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showConfirmPasswordReset}
                  autoCapitalize="none"
                />
                <PressableScale onPress={() => setShowConfirmPasswordReset(!showConfirmPasswordReset)}>
                  {showConfirmPasswordReset ? (
                    <EyeOff size={20} color={Colors.dark.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.dark.textMuted} />
                  )}
                </PressableScale>
              </View>
            </View>

            <PressableScale
              style={[styles.resetButton, isResettingPassword && styles.resetButtonDisabled]}
              onPress={handleResetPassword}
              disabled={isResettingPassword}
              hapticType="medium"
            >
              <Text style={styles.resetButtonText}>
                {isResettingPassword ? 'Resetting...' : 'Reset Password'}
              </Text>
            </PressableScale>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  analyticsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    gap: 10,
    marginBottom: 12,
  },
  analyticsBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    paddingVertical: 10,
    alignItems: 'center',
  },
  analyticsBtnText: {
    color: Colors.dark.text,
    fontSize: 12,
    fontWeight: '700' as const,
  },
  seasonCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginHorizontal: 20,
    marginBottom: 14,
    padding: 14,
  },
  seasonHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  seasonTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  seasonValue: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  seasonMeta: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginBottom: 10,
  },
  closeSeasonBtn: {
    backgroundColor: Colors.dark.error + '20',
    borderWidth: 1,
    borderColor: Colors.dark.error + '60',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeSeasonBtnDisabled: {
    opacity: 0.6,
  },
  closeSeasonBtnText: {
    color: Colors.dark.error,
    fontSize: 13,
    fontWeight: '700' as const,
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
  userCard: {
    backgroundColor: Colors.dark.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  avatarContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.dark.surfaceLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  userDetails: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 2,
  },
  userEmail: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    textTransform: 'capitalize' as const,
  },
  userMeta: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: Colors.dark.textSecondary,
    textTransform: 'capitalize' as const,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark.warning + '15',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  inviteCodeLabel: {
    fontSize: 12,
    color: Colors.dark.warning,
  },
  inviteCode: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark.warning,
    flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  userActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
  },
  actionBtnSuccess: {
    backgroundColor: Colors.dark.success + '15',
  },
  actionBtnDanger: {
    backgroundColor: Colors.dark.error + '15',
  },
  actionBtnDelete: {
    backgroundColor: Colors.dark.error,
  },
  actionBtnWarning: {
    backgroundColor: Colors.dark.warning + '15',
  },
  actionBtnInfo: {
    backgroundColor: Colors.dark.primary + '15',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
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
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
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
    fontSize: 16,
    color: Colors.dark.text,
  },
  optionScroll: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  optionChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    marginRight: 8,
  },
  optionChipActive: {
    backgroundColor: Colors.dark.primary + '20',
    borderColor: Colors.dark.primary,
  },
  optionChipText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  optionChipTextActive: {
    color: Colors.dark.primary,
    fontWeight: '600' as const,
  },
  roleOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  roleOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    alignItems: 'center',
  },
  roleOptionActive: {
    backgroundColor: Colors.dark.primary + '20',
    borderColor: Colors.dark.primary,
  },
  roleOptionText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
  },
  roleOptionTextActive: {
    color: Colors.dark.primary,
    fontWeight: '600' as const,
  },
  createButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  successContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginTop: 16,
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    marginBottom: 24,
  },
  inviteCodeDisplay: {
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 32,
    paddingVertical: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  inviteCodeLarge: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.primary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
  },
  successActions: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.primary,
  },
  copyBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: Colors.dark.primary,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  instructionText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 20,
    marginBottom: 32,
  },
  addAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  addAnotherText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.primary,
  },
  resetPasswordHeader: {
    alignItems: 'center',
    marginBottom: 32,
  },
  resetPasswordIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.dark.warning + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  resetPasswordTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 8,
  },
  resetPasswordSubtitle: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  resetPasswordWarning: {
    fontSize: 13,
    color: Colors.dark.warning,
    textAlign: 'center',
    backgroundColor: Colors.dark.warning + '15',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  passwordHint: {
    fontSize: 12,
    color: Colors.dark.textMuted,
    marginTop: 6,
    marginLeft: 4,
  },
  resetButton: {
    backgroundColor: Colors.dark.warning,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  resetButtonDisabled: {
    opacity: 0.6,
  },
  resetButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
});
