import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, Stack } from 'expo-router';
import { ArrowLeft, Zap, Clock, Users, CheckCircle, XCircle, Link, Camera, Send, ChevronDown } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import PlatformBadge from '@/components/PlatformBadge';
import PressableScale from '@/components/PressableScale';
import LoadingScreen from '@/components/LoadingScreen';
import { Platform as PlatformType, Submission } from '@/types';

export default function TaskDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { addSubmission, tasks, assets, hasUserSubmittedTask } = useApp();
  const { currentUser, requiresSocialSetup } = useAuth();
  const [showSubmitForm, setShowSubmitForm] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformType[]>([]);
  const [linkByPlatform, setLinkByPlatform] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const task = tasks.find(t => t.id === id);
  const relatedAssets = task ? assets.filter(a => task.assetIds?.includes(a.id) || a.campaignId === task.campaignId) : [];
  const daysLeft = task ? Math.ceil((new Date(task.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) : 0;
  const hasAlreadySubmitted = currentUser && task ? hasUserSubmittedTask(currentUser.id, task.id) : false;
  const hasSocialAccount = Boolean(
    currentUser?.handles?.twitter ||
      currentUser?.handles?.instagram ||
      currentUser?.handles?.tiktok ||
      currentUser?.handles?.youtube ||
      currentUser?.handles?.discord
  );
  const blockedForSocialSetup =
    currentUser?.role === 'ambassador' && (requiresSocialSetup || !hasSocialAccount);

  const handleSubmit = useCallback(async () => {
    if (!task) return;
    if (!currentUser?.id) {
      Alert.alert('Session Required', 'Please sign in again.');
      return;
    }
    if (blockedForSocialSetup) {
      Alert.alert(
        'Add a Social Account First',
        'Please add at least one social account in your profile before submitting tasks.'
      );
      return;
    }
    if (selectedPlatforms.length === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Select Platform', 'Please select at least one platform.');
      return;
    }
    const missingLinkPlatform = selectedPlatforms.find((platform) => !linkByPlatform[platform]?.trim());
    if (missingLinkPlatform) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Post URL Required', `Please enter a link for ${missingLinkPlatform}.`);
      return;
    }

    setIsSubmitting(true);

    const links = selectedPlatforms.map((platform) => ({
      platform,
      url: (linkByPlatform[platform] || '').trim(),
    }));

    const newSubmission: Submission = {
      id: `sub-${Date.now()}`,
      userId: currentUser?.id || '',
      taskId: task.id,
      taskTitle: task.title,
      campaignTitle: task.campaignTitle,
      platform: selectedPlatforms[0],
      platforms: selectedPlatforms,
      links,
      postUrl: links[0]?.url || '',
      notes: notes.trim() || undefined,
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };

    const submissionResult = await addSubmission(newSubmission, currentUser.id);
    if (!submissionResult.success) {
      setIsSubmitting(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Submission Failed', submissionResult.error || 'Failed to submit. Please try again.');
      return;
    }
    
    setIsSubmitting(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    Alert.alert(
      'Submission Received! 🎉',
      'Your submission has been sent for review. You\'ll be notified once it\'s approved.',
      [
        { 
          text: 'Great!', 
          onPress: () => {
            setShowSubmitForm(false);
            setLinkByPlatform({});
            setNotes('');
            setSelectedPlatforms([]);
          }
        }
      ]
    );
  }, [selectedPlatforms, linkByPlatform, notes, task, addSubmission, currentUser, blockedForSocialSetup]);

  if (!currentUser) {
    return <LoadingScreen message="Loading user..." />;
  }

  if (!task) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.errorText}>Task not found</Text>
        <PressableScale style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </PressableScale>
      </SafeAreaView>
    );
  }

  return (
    <>
      <Stack.Screen 
        options={{ 
          headerShown: true,
          headerStyle: { backgroundColor: Colors.dark.background },
          headerTintColor: Colors.dark.text,
          headerTitle: '',
          headerLeft: () => (
            <PressableScale onPress={() => router.back()} style={styles.backBtn} testID="back-button">
              <ArrowLeft size={24} color={Colors.dark.text} />
            </PressableScale>
          ),
        }} 
      />
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerTop}>
              <View style={styles.platforms}>
                {task.platforms.map((p) => (
                  <PlatformBadge key={p} platform={p} />
                ))}
              </View>
              <View style={styles.pointsBadge}>
                <Zap size={16} color={Colors.dark.warning} />
                <Text style={styles.pointsText}>{task.points} pts</Text>
              </View>
            </View>

            <Text style={styles.title}>{task.title}</Text>
            <Text style={styles.campaign}>{task.campaignTitle}</Text>

            <View style={styles.metaRow}>
              <View style={styles.metaItem}>
                <Clock size={16} color={daysLeft <= 3 ? Colors.dark.error : Colors.dark.textMuted} />
                <Text style={[styles.metaText, daysLeft <= 3 && styles.urgentText]}>
                  {daysLeft > 0 ? `${daysLeft} days left` : 'Deadline passed'}
                </Text>
              </View>
              <View style={styles.metaItem}>
                <Users size={16} color={Colors.dark.textMuted} />
                <Text style={styles.metaText}>
                  {task.submissions}{task.maxSubmissions ? `/${task.maxSubmissions}` : ''} submitted
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Brief</Text>
            <Text style={styles.briefText}>{task.brief}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Required Hashtags</Text>
            <View style={styles.tagsContainer}>
              {task.hashtags.map((tag) => (
                <PressableScale key={tag} style={styles.tag} haptic={false}>
                  <Text style={styles.tagText}>{tag}</Text>
                </PressableScale>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Required Mentions</Text>
            <View style={styles.tagsContainer}>
              {task.mentions.map((mention) => (
                <PressableScale key={mention} style={[styles.tag, styles.mentionTag]} haptic={false}>
                  <Text style={[styles.tagText, styles.mentionText]}>{mention}</Text>
                </PressableScale>
              ))}
            </View>
          </View>

          <View style={styles.dosAndDonts}>
            <View style={styles.dosSection}>
              <View style={styles.dosHeader}>
                <CheckCircle size={16} color={Colors.dark.success} />
                <Text style={styles.dosTitle}>Do This</Text>
              </View>
              {task.dos.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <View style={[styles.bullet, styles.doBullet]} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>

            <View style={styles.dontsSection}>
              <View style={styles.dontsHeader}>
                <XCircle size={16} color={Colors.dark.error} />
                <Text style={styles.dontsTitle}>Avoid This</Text>
              </View>
              {task.donts.map((item, index) => (
                <View key={index} style={styles.listItem}>
                  <View style={[styles.bullet, styles.dontBullet]} />
                  <Text style={styles.listText}>{item}</Text>
                </View>
              ))}
            </View>
          </View>

          {relatedAssets.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Related Assets</Text>
              <PressableScale style={styles.assetsLink} onPress={() => router.push('/(tabs)/assets')} testID="related-assets">
                <Text style={styles.assetsLinkText}>{relatedAssets.length} assets available</Text>
                <ChevronDown size={16} color={Colors.dark.primary} style={{ transform: [{ rotate: '-90deg' }] }} />
              </PressableScale>
            </View>
          )}

          {showSubmitForm && (
            <View style={styles.submitForm}>
              <Text style={styles.submitFormTitle}>Submit Your Post</Text>
              
              <Text style={styles.inputLabel}>Platform</Text>
              <View style={styles.platformSelect}>
                {task.platforms.map((p) => (
                  <PressableScale
                    key={p}
                    style={[styles.platformOption, selectedPlatforms.includes(p) && styles.platformOptionActive]}
                    onPress={() => {
                      setSelectedPlatforms((prev) =>
                        prev.includes(p) ? prev.filter((item) => item !== p) : [...prev, p]
                      );
                    }}
                    hapticType="selection"
                    testID={`platform-${p}`}
                  >
                    <PlatformBadge platform={p} />
                  </PressableScale>
                ))}
              </View>

              {selectedPlatforms.map((platform) => (
                <View key={platform}>
                  <Text style={styles.inputLabel}>{platform.toUpperCase()} URL</Text>
                  <View style={styles.inputContainer}>
                    <Link size={18} color={Colors.dark.textMuted} />
                    <TextInput
                      style={styles.input}
                      placeholder={`https://${platform}.com/...`}
                      placeholderTextColor={Colors.dark.textMuted}
                      value={linkByPlatform[platform] || ''}
                      onChangeText={(value) =>
                        setLinkByPlatform((prev) => ({
                          ...prev,
                          [platform]: value,
                        }))
                      }
                      autoCapitalize="none"
                      keyboardType="url"
                      testID={`post-url-input-${platform}`}
                    />
                  </View>
                </View>
              ))}

              <Text style={styles.inputLabel}>Notes (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Any additional context for the reviewer..."
                placeholderTextColor={Colors.dark.textMuted}
                value={notes}
                onChangeText={setNotes}
                multiline
                numberOfLines={3}
                testID="notes-input"
              />

              <View style={styles.submitActions}>
                <PressableScale 
                  style={styles.cancelBtn}
                  onPress={() => setShowSubmitForm(false)}
                  testID="cancel-submit"
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </PressableScale>
                <PressableScale 
                  style={[styles.sendBtn, isSubmitting && styles.sendBtnDisabled]}
                  onPress={handleSubmit}
                  hapticType="medium"
                  disabled={isSubmitting}
                  testID="submit-post"
                >
                  <Send size={18} color="#FFF" />
                  <Text style={styles.sendBtnText}>{isSubmitting ? 'Submitting...' : 'Submit'}</Text>
                </PressableScale>
              </View>
            </View>
          )}

          <View style={styles.bottomPadding} />
        </ScrollView>

        {!showSubmitForm && (
          <View style={styles.footer}>
            {hasAlreadySubmitted ? (
              <View style={styles.alreadySubmittedBox}>
                <CheckCircle size={20} color={Colors.dark.success} />
                <Text style={styles.alreadySubmittedText}>You&apos;ve already submitted for this task</Text>
              </View>
            ) : (
              <PressableScale 
                style={[styles.submitBtn, blockedForSocialSetup && styles.submitBtnDisabled]}
                onPress={() => {
                  if (blockedForSocialSetup) {
                    Alert.alert('Add Social Account', 'Go to your profile and add at least one social account first.');
                    return;
                  }
                  setShowSubmitForm(true);
                }}
                disabled={blockedForSocialSetup}
                hapticType="medium"
                testID="open-submit-form"
              >
                <Camera size={20} color="#FFF" />
                <Text style={styles.submitBtnText}>
                  {blockedForSocialSetup ? 'Add Socials to Submit' : 'Submit My Post'}
                </Text>
              </PressableScale>
            )}
          </View>
        )}
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  backBtn: {
    padding: 4,
  },
  errorText: {
    color: Colors.dark.error,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 40,
  },
  backButton: {
    marginTop: 20,
    alignSelf: 'center',
    backgroundColor: Colors.dark.surface,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  backButtonText: {
    color: Colors.dark.primary,
    fontSize: 15,
    fontWeight: '600' as const,
  },
  header: {
    padding: 20,
    paddingTop: 10,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  platforms: {
    flexDirection: 'row',
    gap: 8,
  },
  pointsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.dark.warning + '20',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
  },
  pointsText: {
    color: Colors.dark.warning,
    fontSize: 15,
    fontWeight: '700' as const,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 6,
  },
  campaign: {
    fontSize: 15,
    color: Colors.dark.primary,
    marginBottom: 16,
  },
  metaRow: {
    flexDirection: 'row',
    gap: 20,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 14,
    color: Colors.dark.textMuted,
  },
  urgentText: {
    color: Colors.dark.error,
    fontWeight: '600' as const,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: Colors.dark.text,
    marginBottom: 10,
  },
  briefText: {
    fontSize: 15,
    color: Colors.dark.textSecondary,
    lineHeight: 22,
  },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: Colors.dark.secondary + '20',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 13,
    color: Colors.dark.secondary,
    fontWeight: '600' as const,
  },
  mentionTag: {
    backgroundColor: Colors.dark.primary + '20',
  },
  mentionText: {
    color: Colors.dark.primary,
  },
  dosAndDonts: {
    paddingHorizontal: 20,
    gap: 20,
    marginBottom: 24,
  },
  dosSection: {
    backgroundColor: Colors.dark.success + '10',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.success + '30',
  },
  dontsSection: {
    backgroundColor: Colors.dark.error + '10',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.dark.error + '30',
  },
  dosHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dontsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dosTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.success,
  },
  dontsTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.error,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 6,
  },
  doBullet: {
    backgroundColor: Colors.dark.success,
  },
  dontBullet: {
    backgroundColor: Colors.dark.error,
  },
  listText: {
    flex: 1,
    fontSize: 14,
    color: Colors.dark.textSecondary,
    lineHeight: 20,
  },
  assetsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.dark.surface,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  assetsLinkText: {
    fontSize: 14,
    color: Colors.dark.primary,
    fontWeight: '600' as const,
  },
  submitForm: {
    margin: 20,
    backgroundColor: Colors.dark.surface,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  submitFormTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
    marginBottom: 8,
  },
  platformSelect: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 20,
  },
  platformOption: {
    padding: 10,
    borderRadius: 10,
    backgroundColor: Colors.dark.surfaceLight,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  platformOptionActive: {
    borderColor: Colors.dark.primary,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    gap: 10,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    color: Colors.dark.text,
    fontSize: 15,
    paddingVertical: 14,
  },
  textArea: {
    backgroundColor: Colors.dark.surfaceLight,
    borderRadius: 12,
    padding: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  submitActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.dark.surfaceLight,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.textSecondary,
  },
  sendBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary,
  },
  sendBtnDisabled: {
    opacity: 0.6,
  },
  sendBtnText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: '#FFF',
  },
  footer: {
    padding: 20,
    paddingBottom: 30,
    backgroundColor: Colors.dark.background,
    borderTopWidth: 1,
    borderTopColor: Colors.dark.border,
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.dark.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  submitBtnDisabled: {
    opacity: 0.6,
  },
  submitBtnText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  bottomPadding: {
    height: 20,
  },
  alreadySubmittedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.dark.success + '15',
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.dark.success + '30',
  },
  alreadySubmittedText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: Colors.dark.success,
  },
});
