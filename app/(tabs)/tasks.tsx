import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, Modal, TextInput, Alert } from 'react-native';
import Image from '@/components/StableImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Zap, Clock, Users, ListTodo, Plus, Trash2, Edit3, X, Check, CheckCircle2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';

import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import PlatformBadge from '@/components/PlatformBadge';
import PressableScale from '@/components/PressableScale';
import EmptyState from '@/components/EmptyState';
import { Platform as PlatformType, Task } from '@/types';
import ImagePicker from '@/components/ImagePicker';

type FilterType = 'all' | 'twitter' | 'instagram' | 'tiktok' | 'youtube';
type ImageInputMode = 'upload' | 'url';

const PLATFORM_OPTIONS: PlatformType[] = ['twitter', 'instagram', 'tiktok', 'youtube'];
const INLINE_IMAGE_LIMIT_BYTES = 225_000;

function estimateDataUriBytes(value: string): number | null {
  if (!value.startsWith('data:')) return null;
  const base64 = value.split(',')[1] || '';
  if (!base64) return null;
  return Math.floor((base64.length * 3) / 4);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function TasksScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { tasks, isRefreshing, refreshData, addTask, updateTask, deleteTask, hasUserSubmittedTask } = useApp();
  const { currentUser } = useAuth();
  const [activeFilter] = useState<FilterType>('all');
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageInputMode, setImageInputMode] = useState<ImageInputMode>('upload');
  const [uploadImageSizeBytes, setUploadImageSizeBytes] = useState<number | null>(null);

  const [formData, setFormData] = useState({
    title: '',
    brief: '',
    thumbnail: '',
    campaignTitle: '',
    platforms: [] as PlatformType[],
    hashtags: '',
    mentions: '',
    dos: '',
    donts: '',
    deadline: '',
    points: '',
  });

  

  const filteredTasks = useMemo(() => {
    return activeFilter === 'all' 
      ? tasks 
      : tasks.filter(t => t.platforms.includes(activeFilter as PlatformType));
  }, [tasks, activeFilter]);

  const activeCampaigns = useMemo(() => {
    const campaignMap = new Map<string, {
      title: string;
      thumbnail: string;
      platforms: PlatformType[];
      totalTasks: number;
      completedTasks: number;
    }>();
    
    tasks.forEach(task => {
      const existing = campaignMap.get(task.campaignTitle);
      if (existing) {
        existing.totalTasks += 1;
        if (task.status === 'completed') existing.completedTasks += 1;
        task.platforms.forEach(p => {
          if (!existing.platforms.includes(p)) existing.platforms.push(p);
        });
        if (!existing.thumbnail && task.thumbnail) {
          existing.thumbnail = task.thumbnail;
        }
      } else {
        campaignMap.set(task.campaignTitle, {
          title: task.campaignTitle,
          thumbnail: task.thumbnail || 'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=400&h=300&fit=crop',
          platforms: [...task.platforms],
          totalTasks: 1,
          completedTasks: task.status === 'completed' ? 1 : 0,
        });
      }
    });
    
    return Array.from(campaignMap.values());
  }, [tasks]);

  const handleRefresh = useCallback(() => {
    refreshData();
  }, [refreshData]);

  const resetForm = useCallback(() => {
    setFormData({
      title: '',
      brief: '',
      thumbnail: '',
      campaignTitle: '',
      platforms: [],
      hashtags: '',
      mentions: '',
      dos: '',
      donts: '',
      deadline: '',
      points: '',
    });
    setImageInputMode('upload');
    setUploadImageSizeBytes(null);
    setEditingTask(null);
  }, []);

  const openAddModal = useCallback(() => {
    resetForm();
    setIsModalVisible(true);
  }, [resetForm]);

  const openEditModal = useCallback((task: Task) => {
    const initialImage = task.thumbnail || '';
    const initialBytes = initialImage ? estimateDataUriBytes(initialImage) : null;
    setImageInputMode(initialImage && !initialImage.startsWith('data:') ? 'url' : 'upload');
    setUploadImageSizeBytes(initialBytes);
    setEditingTask(task);
    setFormData({
      title: task.title,
      brief: task.brief,
      thumbnail: task.thumbnail || '',
      campaignTitle: task.campaignTitle,
      platforms: task.platforms,
      hashtags: task.hashtags.join(', '),
      mentions: task.mentions.join(', '),
      dos: task.dos.join('\n'),
      donts: task.donts.join('\n'),
      deadline: task.deadline,
      points: task.points.toString(),
    });
    setIsModalVisible(true);
  }, []);

  const togglePlatform = useCallback((platform: PlatformType) => {
    setFormData(prev => ({
      ...prev,
      platforms: prev.platforms.includes(platform)
        ? prev.platforms.filter(p => p !== platform)
        : [...prev.platforms, platform],
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (!formData.title.trim() || !formData.brief.trim() || formData.platforms.length === 0) {
      Alert.alert('Error', 'Please fill in title, brief, and select at least one platform');
      return;
    }

    setIsSubmitting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const taskData = {
      title: formData.title.trim(),
      brief: formData.brief.trim(),
      thumbnail: formData.thumbnail.trim() || undefined,
      campaignId: 'camp-1',
      campaignTitle: formData.campaignTitle.trim() || 'General Campaign',
      platforms: formData.platforms,
      hashtags: formData.hashtags.split(',').map(h => h.trim()).filter(Boolean),
      mentions: formData.mentions.split(',').map(m => m.trim()).filter(Boolean),
      dos: formData.dos.split('\n').map(d => d.trim()).filter(Boolean),
      donts: formData.donts.split('\n').map(d => d.trim()).filter(Boolean),
      deadline: formData.deadline || new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      points: parseInt(formData.points) || 100,
      status: 'active' as const,
      submissions: editingTask?.submissions || 0,
    };

    let result;
    if (editingTask) {
      result = await updateTask(editingTask.id, taskData);
    } else {
      result = await addTask(taskData);
    }

    setIsSubmitting(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setIsModalVisible(false);
      resetForm();
      Alert.alert('Success', editingTask ? 'Task updated' : 'Task created');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Error', result.error || 'Failed to save task');
    }
  }, [formData, editingTask, addTask, updateTask, resetForm]);

  const handleDelete = useCallback((task: Task) => {
    Alert.alert(
      'Delete Task',
      `Are you sure you want to delete "${task.title}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            const result = await deleteTask(task.id);
            if (result.success) {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            } else {
              Alert.alert('Error', result.error || 'Failed to delete task');
            }
          },
        },
      ]
    );
  }, [deleteTask]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>Tasks</Text>
            <Text style={styles.subtitle}>{filteredTasks.length} active tasks available</Text>
          </View>
          {isAdmin && (
            <PressableScale style={styles.addBtn} onPress={openAddModal} hapticType="medium">
              <Plus size={20} color="#FFF" />
              <Text style={styles.addBtnText}>Add</Text>
            </PressableScale>
          )}
        </View>
      </View>

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
        {activeCampaigns.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Active Campaigns</Text>
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.campaignsScroll}
            >
              {activeCampaigns.map((campaign, index) => (
                <PressableScale key={`campaign-${index}`} style={styles.campaignCard} testID={`campaign-${index}`}>
                  <Image source={campaign.thumbnail} style={styles.campaignImage} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                  <View style={styles.campaignGradient} />
                  <View style={styles.campaignOverlay}>
                    <View style={styles.campaignPlatforms}>
                      {campaign.platforms.slice(0, 3).map((p) => (
                        <PlatformBadge key={p} platform={p} size="small" />
                      ))}
                    </View>
                    <Text style={styles.campaignTitle} numberOfLines={2}>{campaign.title}</Text>
                    <View style={styles.campaignProgress}>
                      <View style={styles.progressBar}>
                        <View 
                          style={[
                            styles.progressFill, 
                            { width: `${campaign.totalTasks > 0 ? (campaign.completedTasks / campaign.totalTasks) * 100 : 0}%` }
                          ]} 
                        />
                      </View>
                      <Text style={styles.progressText}>
                        {campaign.completedTasks}/{campaign.totalTasks} tasks
                      </Text>
                    </View>
                  </View>
                </PressableScale>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Tasks</Text>
          {filteredTasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title="No tasks found"
              message="There are no tasks available at this time."
            />
          ) : (
            filteredTasks.map((task) => {
              const isSubmitted = currentUser ? hasUserSubmittedTask(currentUser.id, task.id) : false;
              return (
              <PressableScale 
                key={task.id} 
                style={[styles.taskCard, isSubmitted && styles.taskCardSubmitted]}
                onPress={() => !isSubmitted && router.push(`/task/${task.id}`)}
                disabled={isSubmitted}
                testID={`task-${task.id}`}
              >
                {isSubmitted && (
                  <View style={styles.submittedOverlay}>
                    <View style={styles.submittedBadge}>
                      <CheckCircle2 size={16} color={Colors.dark.success} />
                      <Text style={styles.submittedText}>Submitted</Text>
                    </View>
                  </View>
                )}
                {task.thumbnail && (
                  <Image source={task.thumbnail} style={styles.taskThumbnail} contentFit="cover" cachePolicy="memory-disk" transition={0} />
                )}
                <View style={styles.taskContent}>
                  <View style={styles.taskHeader}>
                    <View style={styles.taskPlatforms}>
                      {task.platforms.map((p) => (
                        <PlatformBadge key={p} platform={p} />
                      ))}
                    </View>
                    <View style={styles.taskHeaderRight}>
                      <View style={styles.pointsBadge}>
                        <Zap size={14} color={Colors.dark.warning} />
                        <Text style={styles.pointsText}>{task.points} pts</Text>
                      </View>
                      {isAdmin && (
                        <View style={styles.adminActions}>
                          <PressableScale
                            style={styles.adminBtn}
                            onPress={() => openEditModal(task)}
                            hapticType="light"
                          >
                            <Edit3 size={16} color={Colors.dark.primary} />
                          </PressableScale>
                          <PressableScale
                            style={styles.adminBtn}
                            onPress={() => handleDelete(task)}
                            hapticType="light"
                          >
                            <Trash2 size={16} color={Colors.dark.error} />
                          </PressableScale>
                        </View>
                      )}
                    </View>
                  </View>

                  <Text style={styles.taskTitle}>{task.title}</Text>
                  <Text style={styles.taskCampaign}>{task.campaignTitle}</Text>
                  <Text style={styles.taskBrief} numberOfLines={2}>{task.brief}</Text>

                <View style={styles.taskMeta}>
                  <View style={styles.metaItem}>
                    <Clock size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.metaText}>
                      Due {new Date(task.deadline).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Users size={14} color={Colors.dark.textMuted} />
                    <Text style={styles.metaText}>
                      {task.submissions}{task.maxSubmissions ? `/${task.maxSubmissions}` : ''} submitted
                    </Text>
                  </View>
                </View>

                <View style={styles.hashtagsContainer}>
                    {task.hashtags.slice(0, 3).map((tag) => (
                      <View key={tag} style={styles.hashtag}>
                        <Text style={styles.hashtagText}>{tag}</Text>
                      </View>
                    ))}
                    {task.hashtags.length > 3 && (
                      <Text style={styles.moreHashtags}>+{task.hashtags.length - 3}</Text>
                    )}
                  </View>
                </View>
              </PressableScale>
            );
            })
          )}
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>

      <Modal
        visible={isModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setIsModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <PressableScale onPress={() => setIsModalVisible(false)}>
              <X size={24} color={Colors.dark.text} />
            </PressableScale>
            <Text style={styles.modalTitle}>{editingTask ? 'Edit Task' : 'New Task'}</Text>
            <PressableScale onPress={handleSave} disabled={isSubmitting}>
              <Check size={24} color={isSubmitting ? Colors.dark.textMuted : Colors.dark.primary} />
            </PressableScale>
          </View>

          <ScrollView style={styles.modalContent} showsVerticalScrollIndicator={false}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Title *</Text>
              <TextInput
                style={styles.input}
                value={formData.title}
                onChangeText={(text) => setFormData(prev => ({ ...prev, title: text }))}
                placeholder="Task title"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Brief *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.brief}
                onChangeText={(text) => setFormData(prev => ({ ...prev, brief: text }))}
                placeholder="Task description and instructions"
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={4}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Campaign</Text>
              <TextInput
                style={styles.input}
                value={formData.campaignTitle}
                onChangeText={(text) => setFormData(prev => ({ ...prev, campaignTitle: text }))}
                placeholder="Campaign name"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Task Image</Text>
              <View style={styles.sourceRow}>
                <PressableScale
                  style={[styles.sourceOption, imageInputMode === 'upload' && styles.sourceOptionActive]}
                  onPress={() => setImageInputMode('upload')}
                >
                  <Text style={[styles.sourceOptionText, imageInputMode === 'upload' && styles.sourceOptionTextActive]}>Upload</Text>
                </PressableScale>
                <PressableScale
                  style={[styles.sourceOption, imageInputMode === 'url' && styles.sourceOptionActive]}
                  onPress={() => setImageInputMode('url')}
                >
                  <Text style={[styles.sourceOptionText, imageInputMode === 'url' && styles.sourceOptionTextActive]}>URL</Text>
                </PressableScale>
              </View>

              {imageInputMode === 'upload' ? (
                <>
                  <ImagePicker
                    value={formData.thumbnail}
                    onChange={(uri) => {
                      const size = estimateDataUriBytes(uri);
                      setUploadImageSizeBytes(size);
                      setFormData(prev => ({ ...prev, thumbnail: uri }));
                    }}
                    placeholder="Add task image"
                  />
                  {uploadImageSizeBytes !== null && (
                    <Text style={[styles.imageSizeText, uploadImageSizeBytes > INLINE_IMAGE_LIMIT_BYTES && styles.imageSizeTextWarning]}>
                      Upload size: {formatBytes(uploadImageSizeBytes)} (recommended under {formatBytes(INLINE_IMAGE_LIMIT_BYTES)})
                    </Text>
                  )}
                </>
              ) : (
                <TextInput
                  style={styles.input}
                  value={formData.thumbnail}
                  onChangeText={(text) => {
                    setUploadImageSizeBytes(null);
                    setFormData(prev => ({ ...prev, thumbnail: text }));
                  }}
                  placeholder="https://..."
                  placeholderTextColor={Colors.dark.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Platforms *</Text>
              <View style={styles.platformsRow}>
                {PLATFORM_OPTIONS.map((platform) => (
                  <PressableScale
                    key={platform}
                    style={[
                      styles.platformOption,
                      formData.platforms.includes(platform) && styles.platformOptionActive,
                    ]}
                    onPress={() => togglePlatform(platform)}
                    hapticType="selection"
                  >
                    <PlatformBadge platform={platform} size="small" />
                  </PressableScale>
                ))}
              </View>
            </View>

            <View style={styles.row}>
              <View style={[styles.inputGroup, { flex: 1 }]}>
                <Text style={styles.inputLabel}>Points</Text>
                <TextInput
                  style={styles.input}
                  value={formData.points}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, points: text }))}
                  placeholder="100"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="number-pad"
                />
              </View>
              <View style={[styles.inputGroup, { flex: 1, marginLeft: 12 }]}>
                <Text style={styles.inputLabel}>Deadline</Text>
                <TextInput
                  style={styles.input}
                  value={formData.deadline}
                  onChangeText={(text) => setFormData(prev => ({ ...prev, deadline: text }))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={Colors.dark.textMuted}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Hashtags (comma separated)</Text>
              <TextInput
                style={styles.input}
                value={formData.hashtags}
                onChangeText={(text) => setFormData(prev => ({ ...prev, hashtags: text }))}
                placeholder="#hashtag1, #hashtag2"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Mentions (comma separated)</Text>
              <TextInput
                style={styles.input}
                value={formData.mentions}
                onChangeText={(text) => setFormData(prev => ({ ...prev, mentions: text }))}
                placeholder="@account1, @account2"
                placeholderTextColor={Colors.dark.textMuted}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Do Guidelines (one per line)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.dos}
                onChangeText={(text) => setFormData(prev => ({ ...prev, dos: text }))}
                placeholder="Enter guidelines..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Restrictions (one per line)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={formData.donts}
                onChangeText={(text) => setFormData(prev => ({ ...prev, donts: text }))}
                placeholder="Enter restrictions..."
                placeholderTextColor={Colors.dark.textMuted}
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.modalBottomPadding} />
          </ScrollView>
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
    padding: 20,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark.text,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    marginTop: 4,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  addBtnText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  filterScroll: {
    maxHeight: 50,
  },
  filterContainer: {
    paddingHorizontal: 20,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  filterChipActive: {
    backgroundColor: Colors.dark.primary,
    borderColor: Colors.dark.primary,
  },
  filterText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  filterTextActive: {
    color: Colors.dark.text,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  campaignsScroll: {
    paddingHorizontal: 20,
    gap: 12,
  },
  campaignCard: {
    width: 260,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: 12,
  },
  campaignImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
  campaignGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    backgroundColor: 'transparent',
    backgroundImage: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)',
  },
  campaignOverlay: {
    flex: 1,
    padding: 16,
    justifyContent: 'flex-end',
  },
  campaignPlatforms: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  campaignTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 8,
  },
  campaignProgress: {
    gap: 6,
  },
  progressBar: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.dark.primary,
    borderRadius: 2,
  },
  progressText: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  taskCard: {
    backgroundColor: Colors.dark.surface,
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  taskThumbnail: {
    width: '100%',
    height: 140,
  },
  taskContent: {
    padding: 16,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  taskPlatforms: {
    flexDirection: 'row',
    gap: 6,
  },
  taskHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.dark.warning + '20',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pointsText: {
    color: Colors.dark.warning,
    fontSize: 13,
    fontWeight: '700' as const,
  },
  adminActions: {
    flexDirection: 'row',
    gap: 4,
  },
  adminBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: Colors.dark.surfaceLight,
  },
  taskTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 4,
  },
  taskCampaign: {
    fontSize: 13,
    color: Colors.dark.primary,
    marginBottom: 8,
  },
  taskBrief: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
    marginBottom: 12,
  },
  taskMeta: {
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
    color: Colors.dark.textMuted,
  },
  hashtagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  hashtag: {
    backgroundColor: Colors.dark.surfaceLight,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  hashtagText: {
    fontSize: 12,
    color: Colors.dark.secondary,
  },
  moreHashtags: {
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  taskCardSubmitted: {
    opacity: 0.6,
    borderColor: Colors.dark.success + '40',
  },
  submittedOverlay: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
  },
  submittedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.success + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.dark.success + '40',
  },
  submittedText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.success,
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
  sourceRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  sourceOption: {
    flex: 1,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  sourceOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  sourceOptionText: {
    color: Colors.dark.textMuted,
    fontSize: 13,
    fontWeight: '600' as const,
  },
  sourceOptionTextActive: {
    color: Colors.dark.primary,
  },
  imageSizeText: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.dark.textMuted,
  },
  imageSizeTextWarning: {
    color: Colors.dark.warning,
  },
  textArea: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
  },
  platformsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  platformOption: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  platformOptionActive: {
    borderColor: Colors.dark.primary,
    backgroundColor: Colors.dark.primary + '20',
  },
  modalBottomPadding: {
    height: 40,
  },

});
