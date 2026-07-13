import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DEBUG } from '@/constants/debug';

export default function Index() {
  const router = useRouter();
  const {
    currentUser,
    getUserTruck,
    isOwner,
    isOwnerLoading,
    pendingNotificationRoute,
    isInitialNotificationResponseChecked,
  } = useApp();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors } = useTheme();
  const [didNavigate, setDidNavigate] = useState(false);

  useEffect(() => {
    if (didNavigate) return;
    if (!isInitialNotificationResponseChecked) {
      if (DEBUG) console.log('[Index] Waiting for initial notification response check...');
      return;
    }
    if (pendingNotificationRoute) {
      if (DEBUG) console.log('[Index] Waiting for pending notification route:', pendingNotificationRoute);
      return;
    }
    if (authLoading || isOwnerLoading || (isAuthenticated && !currentUser)) {
      if (DEBUG) console.log('[Index] Waiting for auth/owner to load...');
      return;
    }

    if (DEBUG) console.log('[Index] isAuthenticated:', isAuthenticated, 'isOwner:', isOwner);

    const resolveTargetRoute = () => {
      if (!isAuthenticated) {
        return '/(customer)/(tabs)/discover';
      }

      const truck = getUserTruck();
      if (DEBUG) console.log('[Index] Resolving route for truck:', truck?.id ?? null, 'role:', currentUser?.role ?? null);
      return isOwner ? '/(truck)/(tabs)/dashboard' : '/(customer)/(tabs)/discover';
    };

    const timer = setTimeout(() => {
      const targetRoute = resolveTargetRoute();
      if (DEBUG) console.log('[Index] Navigating to:', targetRoute);
      setDidNavigate(true);

      requestAnimationFrame(() => {
        router.replace(targetRoute as any);
      });
    }, 0);

    const failsafeTimer = setTimeout(() => {
      if (!didNavigate) {
        const targetRoute = resolveTargetRoute();
        if (DEBUG) console.log('[Index] Failsafe navigating to:', targetRoute);
        setDidNavigate(true);
        router.replace(targetRoute as any);
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
    };
  }, [router, isOwner, isAuthenticated, authLoading, isOwnerLoading, didNavigate, getUserTruck, currentUser, pendingNotificationRoute, isInitialNotificationResponseChecked]);

  if (didNavigate) {
    return null;
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
