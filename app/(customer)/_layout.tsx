import { Stack } from 'expo-router';
import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { recordReviewEngagement } from '@/lib/appReviewPrompt';

export default function CustomerLayout() {
  const { colors } = useTheme();
  const { currentUser } = useApp();
  const { isAuthenticated, isLoading } = useAuth();
  const recordedAppOpenRef = React.useRef(false);

  React.useEffect(() => {
    if (recordedAppOpenRef.current || isLoading) {
      return;
    }

    if (isAuthenticated && currentUser?.role !== 'customer') {
      return;
    }

    recordedAppOpenRef.current = true;
    void recordReviewEngagement('app_open', { shouldEvaluate: false });
  }, [currentUser?.role, isAuthenticated, isLoading]);
  
  return (
    <Stack screenOptions={{
      headerBackTitle: 'Back',
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerShadowVisible: false,
    }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="truck/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="truck/menu" options={{ headerShown: false }} />
      <Stack.Screen name="add-sighting" options={{ title: 'Add Sighting' }} />
      <Stack.Screen name="settings" options={{ headerShown: false }} />
      <Stack.Screen name="edit-profile" options={{ title: 'Edit Profile' }} />
    </Stack>
  );
}
