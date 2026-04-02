import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { DEBUG } from '@/constants/debug';

export default function Index() {
  const router = useRouter();
  const { isOwner, isOwnerLoading } = useApp();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const { colors } = useTheme();
  const [didNavigate, setDidNavigate] = useState(false);

  useEffect(() => {
    if (didNavigate) return;
    if (authLoading || isOwnerLoading) {
      if (DEBUG) console.log('[Index] Waiting for auth/owner to load...');
      return;
    }

    if (DEBUG) console.log('[Index] isAuthenticated:', isAuthenticated, 'isOwner:', isOwner);

    const timer = setTimeout(() => {
      if (!isAuthenticated) {
        if (DEBUG) console.log('[Index] Not authenticated, going to discover');
        setDidNavigate(true);
        router.replace('/(customer)/(tabs)/discover' as any);
        return;
      }

      const targetRoute = isOwner
        ? '/(truck)/(tabs)/dashboard'
        : '/(customer)/(tabs)/discover';

      if (DEBUG) console.log('[Index] Navigating to:', targetRoute);
      setDidNavigate(true);

      requestAnimationFrame(() => {
        router.replace(targetRoute as any);
      });
    }, 0);

    const failsafeTimer = setTimeout(() => {
      if (!didNavigate) {
        if (DEBUG) console.log('[Index] Failsafe triggered');
        if (!isAuthenticated) {
          setDidNavigate(true);
          router.replace('/(customer)/(tabs)/discover' as any);
        } else {
          const targetRoute = isOwner
            ? '/(truck)/(tabs)/dashboard'
            : '/(customer)/(tabs)/discover';
          if (DEBUG) console.log('[Index] Failsafe navigating to:', targetRoute);
          setDidNavigate(true);
          router.replace(targetRoute as any);
        }
      }
    }, 2000);

    return () => {
      clearTimeout(timer);
      clearTimeout(failsafeTimer);
    };
  }, [router, isOwner, isAuthenticated, authLoading, isOwnerLoading, didNavigate]);

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
