import React from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { FlaskConical } from 'lucide-react-native';
import Colors from '@/constants/colors';
import Typography from '@/constants/typography';
import { useAuth } from '@/contexts/AuthContext';
import AppBackButton from '@/components/AppBackButton';
import AppButton from '@/components/AppButton';
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

  const launchCrossCraft = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open('/crosscraft/index.html', '_blank', 'noopener,noreferrer');
      return;
    }

    Alert.alert(
      'Web Only',
      'CrossCraft Lab is currently wired for web testing only. Open the web app admin panel to launch it.'
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.content}>
        <AppBackButton onPress={() => router.back()} />
        <View style={styles.card}>
          <View style={styles.iconWrap}>
            <FlaskConical size={22} color={Colors.dark.primary} />
          </View>
          <Text style={styles.title}>CrossCraft Lab</Text>
          <Text style={styles.subtitle}>
            Admin-only testing area for the crossword prototype. This does not affect live ambassador flows.
          </Text>
          <AppButton label="Launch CrossCraft" onPress={launchCrossCraft} />
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
});
