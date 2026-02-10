import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TextInput, Alert, KeyboardAvoidingView, Platform, ScrollView, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Redirect } from 'expo-router';
import { Mail, Lock, Key, Eye, EyeOff, UserPlus, Circle, CheckCircle } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import Colors from '@/constants/colors';
import { useAuth } from '@/contexts/AuthContext';
import PressableScale from '@/components/PressableScale';
import { getApiBaseUrl } from '@/lib/trpc';

type AuthMode = 'login' | 'activate';

export default function LoginScreen() {
  const router = useRouter();
  const { login, activateAccount, isLoading, isAuthenticated } = useAuth();
  
  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('debug') === '1';
    } catch {
      return false;
    }
  }, []);
  const [debugApiUrl, setDebugApiUrl] = useState(() => getApiBaseUrl());

  const handleLogin = useCallback(async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Error', 'Please enter your email and password');
      return;
    }

    setIsSubmitting(true);
    const result = await login(email.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Login Failed', result.error);
    }
  }, [email, password, login, router]);

  const handleActivate = useCallback(async () => {
    if (!email.trim() || !inviteCode.trim() || !password.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match');
      return;
    }

    if (password.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setIsSubmitting(true);
    const result = await activateAccount(email.trim(), inviteCode.trim(), password);
    setIsSubmitting(false);

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Welcome!', 'Your account is now active. You can start submitting content!', [
        { text: 'Get Started', onPress: () => router.replace('/(tabs)') }
      ]);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Activation Failed', result.error);
    }
  }, [email, inviteCode, password, confirmPassword, activateAccount, router]);

  if (!isLoading && isAuthenticated) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <Image 
                source={{ uri: 'https://pub-e001eb4506b145aa938b5d3badbff6a5.r2.dev/attachments/kr6ja3s2mmqcg9d8ggqeg' }}
                style={styles.logo}
              />
            </View>
            <Text style={styles.title}>Ambassador OS</Text>
            <Text style={styles.subtitle}>
              {mode === 'login' ? 'Sign in to your account' : 'Activate your account'}
            </Text>
          </View>

          {debugEnabled && (
            <View style={styles.debugBox}>
              <Text style={styles.debugTitle}>Debug: Backend URL</Text>
              <Text style={styles.debugValue}>{debugApiUrl || '(empty)'}</Text>
              <TextInput
                style={styles.debugInput}
                value={debugApiUrl}
                onChangeText={setDebugApiUrl}
                placeholder="https://ambassadorostg.onrender.com"
                placeholderTextColor={Colors.dark.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <PressableScale
                style={styles.debugButton}
                onPress={() => {
                  if (typeof window === 'undefined') return;
                  try {
                    localStorage.setItem('RORK_API_BASE_URL', debugApiUrl.trim());
                    window.location.reload();
                  } catch {
                    Alert.alert('Debug', 'Failed to save backend URL');
                  }
                }}
              >
                <Text style={styles.debugButtonText}>Save & Reload</Text>
              </PressableScale>
            </View>
          )}

          <View style={styles.tabContainer}>
            <PressableScale 
              style={[styles.tabCard, mode === 'login' && styles.tabCardActive]}
              onPress={() => setMode('login')}
              hapticType="selection"
            >
              <View style={styles.tabCardIndicator}>
                {mode === 'login' ? (
                  <CheckCircle size={18} color={Colors.dark.primary} />
                ) : (
                  <Circle size={18} color={Colors.dark.textMuted} />
                )}
              </View>
              <Lock size={22} color={mode === 'login' ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.tabCardTitle, mode === 'login' && styles.tabCardTitleActive]}>Sign In</Text>
              <Text style={styles.tabCardSubtitle}>Existing account</Text>
            </PressableScale>
            <PressableScale 
              style={[styles.tabCard, mode === 'activate' && styles.tabCardActive]}
              onPress={() => setMode('activate')}
              hapticType="selection"
            >
              <View style={styles.tabCardIndicator}>
                {mode === 'activate' ? (
                  <CheckCircle size={18} color={Colors.dark.primary} />
                ) : (
                  <Circle size={18} color={Colors.dark.textMuted} />
                )}
              </View>
              <Key size={22} color={mode === 'activate' ? Colors.dark.primary : Colors.dark.textMuted} />
              <Text style={[styles.tabCardTitle, mode === 'activate' && styles.tabCardTitleActive]}>Activate</Text>
              <Text style={styles.tabCardSubtitle}>First time? Use code</Text>
            </PressableScale>
          </View>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <View style={styles.inputContainer}>
                <Mail size={20} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="your.email@fsl.com"
                  placeholderTextColor={Colors.dark.textMuted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  testID="email-input"
                />
              </View>
            </View>

            {mode === 'activate' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Invite Code</Text>
                <View style={styles.inputContainer}>
                  <Key size={20} color={Colors.dark.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={inviteCode}
                    onChangeText={setInviteCode}
                    placeholder="FSL2026ABC"
                    placeholderTextColor={Colors.dark.textMuted}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    testID="invite-code-input"
                  />
                </View>
              </View>
            )}

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <View style={styles.inputContainer}>
                <Lock size={20} color={Colors.dark.textMuted} />
                <TextInput
                  style={styles.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder={mode === 'activate' ? 'Create a password' : 'Enter password'}
                  placeholderTextColor={Colors.dark.textMuted}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  testID="password-input"
                />
                <PressableScale onPress={() => setShowPassword(!showPassword)}>
                  {showPassword ? (
                    <EyeOff size={20} color={Colors.dark.textMuted} />
                  ) : (
                    <Eye size={20} color={Colors.dark.textMuted} />
                  )}
                </PressableScale>
              </View>
            </View>

            {mode === 'activate' && (
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Confirm Password</Text>
                <View style={styles.inputContainer}>
                  <Lock size={20} color={Colors.dark.textMuted} />
                  <TextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Confirm your password"
                    placeholderTextColor={Colors.dark.textMuted}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    testID="confirm-password-input"
                  />
                </View>
              </View>
            )}

            <PressableScale 
              style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
              onPress={mode === 'login' ? handleLogin : handleActivate}
              disabled={isSubmitting}
              hapticType="medium"
              testID="submit-button"
            >
              <Text style={styles.submitButtonText}>
                {isSubmitting ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Activate Account'}
              </Text>
            </PressableScale>
          </View>

          <View style={styles.footer}>
            {mode === 'login' ? (
              <View style={styles.footerContent}>
                <UserPlus size={18} color={Colors.dark.textMuted} />
                <Text style={styles.footerText}>
                  No account? Contact your admin to receive an invite.
                </Text>
              </View>
            ) : (
              <View style={styles.footerContent}>
                <Text style={styles.footerText}>
                  Enter the invite code sent by your admin to activate your account.
                </Text>
              </View>
            )}
          </View>


        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  keyboardView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: 24,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 20,
    borderWidth: 2,
    borderColor: Colors.dark.primary,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    color: Colors.dark.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 24,
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
    fontSize: 11,
    color: Colors.dark.textMuted,
    marginTop: 4,
    textAlign: 'center' as const,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    gap: 8,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: Colors.dark.textSecondary,
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
  submitButton: {
    backgroundColor: Colors.dark.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: '#FFF',
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  footerText: {
    fontSize: 13,
    color: Colors.dark.textMuted,
    textAlign: 'center',
    flex: 1,
  },
  debugBox: {
    marginBottom: 20,
    padding: 14,
    borderRadius: 12,
    backgroundColor: Colors.dark.surface,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    gap: 8,
  },
  debugTitle: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.dark.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
  },
  debugValue: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
  },
  debugInput: {
    backgroundColor: Colors.dark.background,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: Colors.dark.text,
    borderWidth: 1,
    borderColor: Colors.dark.border,
  },
  debugButton: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.dark.primary,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  debugButtonText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700' as const,
  },

});
