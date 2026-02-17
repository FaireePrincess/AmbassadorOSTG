import { Stack, useRouter, useSegments } from "expo-router";
import React, { useEffect, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Colors from "@/constants/colors";
import { AppProvider } from "@/contexts/AppContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import { trpc, trpcReactClient } from "@/lib/trpc";

function RootLayoutNav() {
  const { isAuthenticated, isLoading, currentUser, requiresSocialSetup } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    const inAuthGroup = segments[0] === 'login';
    const isOnProfile = segments[0] === '(tabs)' && segments[1] === 'profile';
    const mustCompleteSocialSetup =
      isAuthenticated &&
      currentUser?.role === 'ambassador' &&
      requiresSocialSetup;

    if (!isAuthenticated && !inAuthGroup) {
      router.replace('/login');
    } else if (mustCompleteSocialSetup && !isOnProfile) {
      router.replace('/(tabs)/profile');
    } else if (isAuthenticated && inAuthGroup) {
      router.replace(mustCompleteSocialSetup ? '/(tabs)/profile' : '/(tabs)');
    }
  }, [isAuthenticated, isLoading, segments, router, requiresSocialSetup, currentUser?.role]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color={Colors.dark.primary} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerBackTitle: "Back",
          headerStyle: { backgroundColor: Colors.dark.background },
          headerTintColor: Colors.dark.text,
          contentStyle: { backgroundColor: Colors.dark.background },
        }}
      >
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 5 * 60 * 1000,
      },
    },
  }));

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as any).Telegram?.WebApp;
    if (tg) {
      tg.ready();
      tg.expand?.();
    }
  }, []);

  return (
    <trpc.Provider client={trpcReactClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <AuthProvider>
              <AppProvider>
                <RootLayoutNav />
              </AppProvider>
            </AuthProvider>
          </GestureHandlerRootView>
        </ErrorBoundary>
      </QueryClientProvider>
    </trpc.Provider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.dark.background,
  },
});
