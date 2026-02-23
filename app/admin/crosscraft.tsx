import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import Colors from '@/constants/colors';
import Typography from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import AppBackButton from '@/components/AppBackButton';
import EmptyState from '@/components/EmptyState';

export default function AdminCrossCraftScreen() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  if (!isAdmin) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <EmptyState
          icon={FlaskConical}
          title="Admin Access Required"
          message="CrossCraft Lab is available only to administrators."
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.content}>
        <AppBackButton onPress={() => router.back()} />
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <FlaskConical size={22} color={Colors.dark.primary} />
          </View>
          <Text style={styles.title}>CrossCraft Lab</Text>
          <Text style={styles.subtitle}>
            Admin-only testing area for the crossword prototype. Use the input panel to choose words/clues and load new puzzles.
          </Text>
          {Platform.OS === 'web' ? (
            <View style={styles.frameWrap}>
              {React.createElement('iframe' as any, {
                src: '/crosscraft/index.html',
                title: 'CrossCraft Lab',
                style: { width: '100%', height: '100%', border: '0' },
              })}
            </View>
          ) : (
            <Text style={styles.nativeHint}>
              CrossCraft embed is available on web. Open the web admin panel to test and configure crossword words.
            </Text>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.dark.background,
  },
  content: {
    padding: 20,
    gap: 14,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.dark.border,
    backgroundColor: Colors.dark.surface,
    padding: 16,
    gap: 12,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.dark.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: Colors.dark.text,
    fontSize: Typography.sizes.h3,
    fontWeight: Typography.weights.bold,
  },
  subtitle: {
    color: Colors.dark.textSecondary,
    fontSize: Typography.sizes.body,
    lineHeight: 20,
  },
  frameWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.dark.border,
    height: 640,
    backgroundColor: Colors.dark.background,
  },
  nativeHint: {
    color: Colors.dark.textMuted,
    fontSize: Typography.sizes.body,
  },
});
