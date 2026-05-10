import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';

export default function TruckLayout() {
  const { colors } = useTheme();
  const { isAuthenticated, isLoading } = useAuth();
  const { currentUser, isOwner, isOwnerLoading } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();

  const loading = isLoading || isOwnerLoading || (isAuthenticated && !currentUser);

  useTruckLifecycleLogger('TruckLayout');

  useEffect(() => {
    if (__DEV__) {
      console.log('[TruckLayout] auth gate evaluated:', {
        pathname,
        segments: [...segments],
        loading,
        isAuthenticated,
        isOwner,
        hasCurrentUser: Boolean(currentUser),
      });
    }
    if (loading) return;
    if (!isAuthenticated) {
      console.log('[TruckLayout] Not authenticated, redirecting to login', {
        pathname,
        segments: [...segments],
      });
      router.replace('/truck-login' as any);
      return;
    }
    if (!isOwner) {
      console.log('[TruckLayout] Authenticated but no owned trucks, redirecting to login', {
        pathname,
        segments: [...segments],
      });
      router.replace('/truck-login' as any);
      return;
    }
  }, [currentUser, isAuthenticated, loading, isOwner, pathname, router, segments]);

  if (loading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!isAuthenticated || !isOwner) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{
      headerBackTitle: 'Back',
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerShadowVisible: false,
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="menu-editor" options={{ title: 'Menu Editor' }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit Profile' }} />
      <Stack.Screen name="gallery" options={{ title: 'Gallery' }} />
      <Stack.Screen name="update-location" options={{ title: 'Update Location' }} />
      <Stack.Screen name="operating-hours" options={{ title: 'Operating Hours' }} />
      <Stack.Screen name="reviews" options={{ title: 'Reviews' }} />
      <Stack.Screen name="analytics" options={{ title: 'Analytics' }} />
      <Stack.Screen name="announcements" options={{ title: 'Announcements' }} />
      <Stack.Screen name="verification" options={{ title: 'Verification' }} />
      <Stack.Screen name="poster-maker" options={{ title: 'Poster Maker' }} />
      <Stack.Screen name="poster" options={{ title: 'Poster' }} />
      <Stack.Screen name="poster-video" options={{ title: 'Video Poster' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="owner-updates" options={{ title: 'Message Center' }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
