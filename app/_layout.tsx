import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, usePathname, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from 'expo-notifications';
import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider, useApp } from "@/contexts/AppContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { SupabaseAuthProvider } from "@/contexts/SupabaseAuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import * as Linking from 'expo-linking';
import { trpc, trpcClient } from "@/lib/trpc";
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { trackEvent } from '@/lib/analytics';
import { getTruckRouteFromUrl } from '@/lib/truckShare';
import { PASSWORD_RECOVERY_PATH } from '@/lib/authRedirect';

void SplashScreen.preventAutoHideAsync().catch((e) => {
  console.log('[RootLayout] SplashScreen.preventAutoHideAsync error:', e);
});

const queryClient = new QueryClient();
const VERIFICATION_LINK_TYPES = new Set(['signup', 'invite', 'magiclink', 'email', 'email_change']);
const RECOVERY_LINK_TYPE = 'recovery';
const OWNER_DASHBOARD_ROUTE = '/(truck)/(tabs)/dashboard';
const OWNER_MESSAGE_CENTER_ROUTE = '/(truck)/owner-updates';

type NotificationData = Record<string, unknown>;

const devLog = (...args: unknown[]) => {
  if (__DEV__) console.log(...args);
};

const getUrlParams = (url: string): URLSearchParams => {
  const params = new URLSearchParams();
  const [withoutHash, hash = ''] = url.split('#');
  const queryStart = withoutHash.indexOf('?');

  if (queryStart >= 0) {
    const queryParams = new URLSearchParams(withoutHash.slice(queryStart + 1));
    queryParams.forEach((value, key) => params.set(key, value));
  }

  if (hash) {
    const hashQuery = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : hash;
    const hashParams = new URLSearchParams(hashQuery.replace(/^\?/, ''));
    hashParams.forEach((value, key) => params.set(key, value));
  }

  return params;
};

const getAuthLinkParams = (url: string) => {
  const params = getUrlParams(url);

  return {
    code: params.get('code'),
    tokenHash: params.get('token_hash'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    type: params.get('type'),
    email: params.get('email') ?? undefined,
    errorCode: params.get('error_code') ?? params.get('error'),
    errorDescription: params.get('error_description'),
  };
};

const getNormalizedDeepLinkPath = (url: string, parsedPath?: string | null): string => {
  const pathFromExpo = parsedPath?.replace(/^\/+|\/+$/g, '') ?? '';
  if (pathFromExpo) return pathFromExpo;

  try {
    const parsedUrl = new URL(url);
    const host = parsedUrl.host.replace(/^\/+|\/+$/g, '');
    const pathname = parsedUrl.pathname.replace(/^\/+|\/+$/g, '');
    return [host, pathname].filter(Boolean).join('/');
  } catch {
    return '';
  }
};

const getStringDataValue = (data: NotificationData, keys: string[]): string => {
  for (const key of keys) {
    const value = data[key];

    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value);
    }
  }

  return '';
};

const getTruckRouteFromNotificationData = (
  data?: Notifications.NotificationContent['data']
): string | null => {
  if (!data) return null;

  const notificationData = data as NotificationData;
  const url = getStringDataValue(notificationData, ['url', 'deepLink', 'deep_link', 'link']);
  const routeFromUrl = getTruckRouteFromUrl(url);

  if (routeFromUrl) {
    return routeFromUrl;
  }

  const truckId = getStringDataValue(notificationData, ['truck_id', 'truckId']);
  return truckId ? `/truck/${encodeURIComponent(truckId)}` : null;
};

const getTruckIdFromNotificationData = (
  data?: Notifications.NotificationContent['data']
): string | null => {
  if (!data) return null;

  const notificationData = data as NotificationData;
  const truckId = getStringDataValue(notificationData, ['truck_id', 'truckId']);
  return truckId || null;
};

const getRouteFromNotificationData = (
  data?: Notifications.NotificationContent['data']
): string | null => {
  if (!data) return null;

  const notificationData = data as NotificationData;
  const notificationType = getStringDataValue(notificationData, ['type']);

  if (notificationType === 'upcoming_stop_reminder') {
    return OWNER_DASHBOARD_ROUTE;
  }

  if (notificationType === 'owner_message') {
    return OWNER_MESSAGE_CENTER_ROUTE;
  }

  const route = getStringDataValue(notificationData, ['route']);

  return route || null;
};

function NotificationResponseCoordinator() {
  const router = useRouter();
  const pathname = usePathname();
  const { user: authUser, isLoading: authLoading } = useAuth();
  const {
    currentUser,
    getUserTruck,
    isOwner,
    isOwnerLoading,
    setIsInitialNotificationResponseChecked,
    pendingNotificationRoute,
    setPendingNotificationRoute,
  } = useApp();
  const handledResponseIds = useRef(new Set<string>());
  const queuedResponseId = useRef<string | null>(null);
  const navigationRequested = useRef(false);

  useEffect(() => {
    if (Platform.OS === 'web') {
      devLog('[NotificationCoordinator] Skipping notification response setup on web');
      setIsInitialNotificationResponseChecked(true);
      return;
    }

    const handleNotificationResponse = (
      response: Notifications.NotificationResponse,
      source: 'initial' | 'listener'
    ) => {
      const responseId = response.notification.request.identifier;
      const notificationData = response.notification.request.content.data;

      if (handledResponseIds.current.has(responseId)) {
        devLog('[NotificationCoordinator] Notification response already handled; ignoring duplicate');
        return;
      }

      const route = getRouteFromNotificationData(notificationData) ?? getTruckRouteFromNotificationData(notificationData);
      if (!route) {
        devLog('[NotificationCoordinator] Notification response has no route:', {
          source,
          data: notificationData,
        });
        return;
      }

      handledResponseIds.current.add(responseId);
      const truckId = getTruckIdFromNotificationData(notificationData);
      if (truckId) {
        void trackEvent({
          event_type: 'notification_tap',
          truck_id: truckId,
          metadata: { source },
        });
      }

      if (route === OWNER_MESSAGE_CENTER_ROUTE) {
        queuedResponseId.current = responseId;
        navigationRequested.current = false;
        devLog('[NotificationCoordinator] Queuing owner message route:', { source, route });
        setPendingNotificationRoute(route);
        return;
      }

      devLog('[NotificationCoordinator] Routing from notification:', { source, route });
      router.replace(route as any);
      void Notifications.clearLastNotificationResponseAsync().catch((error) => {
        devLog('[NotificationCoordinator] Error clearing handled notification response:', error);
      });
    };

    void Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) handleNotificationResponse(response, 'initial');
        setIsInitialNotificationResponseChecked(true);
      })
      .catch((error) => {
        devLog('[NotificationCoordinator] Error handling initial notification response:', error);
        setIsInitialNotificationResponseChecked(true);
      });

    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      handleNotificationResponse(response, 'listener');
    });

    return () => subscription.remove();
  }, [router, setIsInitialNotificationResponseChecked, setPendingNotificationRoute]);

  useEffect(() => {
    if (pendingNotificationRoute !== OWNER_MESSAGE_CENTER_ROUTE || navigationRequested.current) return;
    if (authLoading) return;

    if (!authUser) {
      router.replace('/truck-login' as any);
      return;
    }

    const isAdmin = currentUser?.role === 'admin';
    const hasOwnerTruckContext = isAdmin || Boolean(getUserTruck());
    if (isOwnerLoading || !currentUser || !isOwner || !hasOwnerTruckContext) return;

    navigationRequested.current = true;
    devLog('[NotificationCoordinator] Owner context ready; navigating to queued route:', {
      route: pendingNotificationRoute,
      responseId: queuedResponseId.current,
      isAdmin,
    });
    router.replace(pendingNotificationRoute as any);
  }, [
    authLoading,
    authUser,
    currentUser,
    getUserTruck,
    isOwner,
    isOwnerLoading,
    pendingNotificationRoute,
    router,
  ]);

  useEffect(() => {
    if (!navigationRequested.current || !pathname.endsWith('/owner-updates')) return;

    navigationRequested.current = false;
    queuedResponseId.current = null;
    setPendingNotificationRoute(null);
    void Notifications.clearLastNotificationResponseAsync().catch((error) => {
      devLog('[NotificationCoordinator] Error clearing consumed notification response:', error);
    });
  }, [pathname, pendingNotificationRoute, setPendingNotificationRoute]);

  return null;
}

function RootLayoutNav() {
  const { colors } = useTheme();
  const pathname = usePathname();
  const segments = useSegments();

  useEffect(() => {
    devLog('[RootLayoutNav] route changed:', {
      pathname,
      segments: [...segments],
    });
  }, [pathname, segments]);
  
  return (
    <Stack screenOptions={{
      headerBackTitle: "Back",
      headerStyle: { backgroundColor: colors.background },
      headerTintColor: colors.text,
      headerShadowVisible: false,
    }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="role-select" options={{ headerShown: false }} />
      <Stack.Screen name="truck-setup" options={{ title: 'Create Truck' }} />
      <Stack.Screen name="truck-login" options={{ title: 'Truck Owner Login' }} />
      <Stack.Screen name="admin-truck-picker" options={{ title: 'Choose a Truck' }} />
      <Stack.Screen name="admin-live-activity" options={{ title: 'LIVE Activity' }} />
      <Stack.Screen name="customer-login" options={{ headerShown: false, presentation: 'transparentModal' }} />
      <Stack.Screen name="auth/check-email" options={{ headerShown: false }} />
      <Stack.Screen name="auth/verified" options={{ headerShown: false }} />
      <Stack.Screen name="auth/reset-password" options={{ headerShown: false }} />
      <Stack.Screen name="(customer)" options={{ headerShown: false }} />
      <Stack.Screen name="(truck)" options={{ headerShown: false }} />
      <Stack.Screen name="truck/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="public/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" />
    </Stack>
  );
}

export default function RootLayout() {
  const router = useRouter();
  const handledAuthUrls = useRef(new Set<string>());

  useEffect(() => {
    void SplashScreen.hideAsync().catch((e) => {
      console.log('[RootLayout] SplashScreen.hideAsync error:', e);
    });

    if (Platform.OS === 'web') {
      devLog('[RootLayout] Skipping deep link setup on web');
      return;
    }

    const handleDeepLink = async (event: { url: string }) => {
      try {
        devLog('[RootLayout] Deep link received:', event.url);

        const { path } = Linking.parse(event.url);
        const {
          code,
          tokenHash,
          accessToken,
          refreshToken,
          type,
          email,
          errorCode,
          errorDescription,
        } = getAuthLinkParams(event.url);
        const normalizedPath = getNormalizedDeepLinkPath(event.url, path);
        const isRecoveryPath =
          normalizedPath === PASSWORD_RECOVERY_PATH || normalizedPath === 'reset-password';
        const isRecoveryLink = type === RECOVERY_LINK_TYPE || isRecoveryPath;
        const isVerificationLink = !!type && VERIFICATION_LINK_TYPES.has(type);
        const isAuthLink = !!(code || tokenHash || accessToken || refreshToken || type || errorCode);

        devLog('[RootLayout] Deep link parsed:', {
          path,
          normalizedPath,
          type: type ?? null,
          email: email ?? null,
          hasCode: !!code,
          hasTokenHash: !!tokenHash,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          errorCode: errorCode ?? null,
          isAuthLink,
          isRecoveryLink,
          isVerificationLink,
        });

        if (isAuthLink) {
          if (handledAuthUrls.current.has(event.url)) {
            devLog('[RootLayout] Auth deep link already handled; ignoring duplicate');
            return;
          }
          handledAuthUrls.current.add(event.url);

          let authError: unknown = null;
          let authAction = 'none';

          if (!isSupabaseConfigured) {
            authError = new Error('Supabase is not configured.');
          } else if (errorCode) {
            authError = new Error(errorDescription || errorCode);
          } else if (code) {
            authAction = 'exchangeCodeForSession';
            devLog('[RootLayout] Attempting exchangeCodeForSession');
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            authError = error;
          } else if (tokenHash && type) {
            authAction = 'verifyOtp';
            devLog('[RootLayout] Attempting verifyOtp for deep link');
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as any,
            });
            authError = error;
          } else if (accessToken && refreshToken) {
            authAction = 'setSession';
            devLog('[RootLayout] Attempting setSession from deep link tokens');
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            authError = error;
          } else if (isVerificationLink) {
            devLog('[RootLayout] Verification link missing exchange credentials; treating as invalid or expired');
            authError = new Error('Missing verification credentials in deep link.');
          } else if (isRecoveryLink) {
            devLog('[RootLayout] Recovery link missing exchange credentials; treating as invalid or expired');
            authError = new Error('Missing recovery credentials in deep link.');
          } else {
            devLog('[RootLayout] Auth-like deep link without exchange credentials; leaving auth state unchanged');
          }

          if (authError) {
            devLog('[RootLayout] Auth deep link failed:', {
              action: authAction,
              error: authError,
              type: type ?? null,
            });

            if (isRecoveryLink) {
              devLog('[RootLayout] Routing to recovery failure screen');
              router.replace({
                pathname: '/auth/reset-password',
                params: {
                  error: 'recovery_failed',
                },
              } as any);
            } else {
              devLog('[RootLayout] Routing to verification failure screen');
              router.replace({
                pathname: '/auth/check-email',
                params: {
                  error: 'verification_failed',
                  email,
                },
              } as any);
            }
          } else if (isRecoveryLink) {
            devLog('[RootLayout] Recovery deep link succeeded; routing to reset password');
            router.replace('/auth/reset-password' as any);
          } else if (isVerificationLink || code || accessToken || refreshToken || tokenHash) {
            devLog('[RootLayout] Verification/auth deep link succeeded; routing to verified');
            router.replace('/auth/verified' as any);
          } else {
            devLog('[RootLayout] Auth-like deep link required no route change');
          }

          return;
        }

        const truckRoute = getTruckRouteFromUrl(event.url);
        if (truckRoute) {
          devLog('[RootLayout] Routing to truck screen from deep link:', truckRoute);
          router.replace(truckRoute as any);
          return;
        }
      } catch (error) {
        devLog('[RootLayout] Error handling deep link:', error);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        devLog('[RootLayout] Initial URL:', url);
        handleDeepLink({ url });
      }
    }).catch((error) => {
      devLog('[RootLayout] Error handling initial URL:', error);
    });

    const subscription = Linking.addEventListener('url', handleDeepLink);

    return () => {
      subscription.remove();
    };
  }, [router]);

  return (
    <ErrorBoundary>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider>
              <SupabaseAuthProvider>
                <AuthProvider>
                  <AppProvider>
                    <NotificationProvider>
                      <NotificationResponseCoordinator />
                      <RootLayoutNav />
                    </NotificationProvider>
                  </AppProvider>
                </AuthProvider>
              </SupabaseAuthProvider>
            </ThemeProvider>
          </GestureHandlerRootView>
        </QueryClientProvider>
      </trpc.Provider>
    </ErrorBoundary>
  );
}
