import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AppProvider } from "@/contexts/AppContext";
import { ThemeProvider, useTheme } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SupabaseAuthProvider } from "@/contexts/SupabaseAuthContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import * as Linking from 'expo-linking';
import { trpc, trpcClient } from "@/lib/trpc";
import { DEBUG } from "@/constants/debug";
import { supabase } from '@/lib/supabase';

void SplashScreen.preventAutoHideAsync().catch((e) => {
  console.log('[RootLayout] SplashScreen.preventAutoHideAsync error:', e);
});

const queryClient = new QueryClient();
const VERIFICATION_LINK_TYPES = new Set(['signup', 'invite', 'magiclink', 'email', 'email_change']);
const RECOVERY_LINK_TYPE = 'recovery';

const getAuthLinkParams = (url: string) => {
  const [baseUrl, hash = ''] = url.split('#');
  const queryString = baseUrl.includes('?') ? baseUrl.split('?')[1] : '';
  const queryParams = new URLSearchParams(queryString);
  const hashParams = new URLSearchParams(hash);

  return {
    code: queryParams.get('code') ?? hashParams.get('code'),
    tokenHash: queryParams.get('token_hash') ?? hashParams.get('token_hash'),
    accessToken: queryParams.get('access_token') ?? hashParams.get('access_token'),
    refreshToken: queryParams.get('refresh_token') ?? hashParams.get('refresh_token'),
    type: queryParams.get('type') ?? hashParams.get('type'),
    email: queryParams.get('email') ?? hashParams.get('email') ?? undefined,
  };
};

function RootLayoutNav() {
  const { colors } = useTheme();
  
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

  useEffect(() => {
    void SplashScreen.hideAsync().catch((e) => {
      console.log('[RootLayout] SplashScreen.hideAsync error:', e);
    });

    if (Platform.OS === 'web') {
      if (DEBUG) console.log('[RootLayout] Skipping deep link setup on web');
      return;
    }

    const handleDeepLink = async (event: { url: string }) => {
      try {
        console.log('[RootLayout] Deep link received:', event.url);

        const { path } = Linking.parse(event.url);
        const { code, tokenHash, accessToken, refreshToken, type, email } = getAuthLinkParams(event.url);
        const isRecoveryLink = type === RECOVERY_LINK_TYPE;
        const isVerificationLink = !!type && VERIFICATION_LINK_TYPES.has(type);
        const isAuthLink = !!(code || tokenHash || accessToken || refreshToken || type);

        console.log('[RootLayout] Deep link parsed:', {
          path,
          type: type ?? null,
          email: email ?? null,
          hasCode: !!code,
          hasTokenHash: !!tokenHash,
          hasAccessToken: !!accessToken,
          hasRefreshToken: !!refreshToken,
          isAuthLink,
          isRecoveryLink,
          isVerificationLink,
        });

        if (isAuthLink) {
          let authError: unknown = null;
          let authAction = 'none';

          if (code) {
            authAction = 'exchangeCodeForSession';
            console.log('[RootLayout] Attempting exchangeCodeForSession');
            const { error } = await supabase.auth.exchangeCodeForSession(code);
            authError = error;
          } else if (tokenHash && type) {
            authAction = 'verifyOtp';
            console.log('[RootLayout] Attempting verifyOtp for deep link');
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as any,
            });
            authError = error;
          } else if (accessToken && refreshToken) {
            authAction = 'setSession';
            console.log('[RootLayout] Attempting setSession from deep link tokens');
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            authError = error;
          } else if (isVerificationLink) {
            console.log('[RootLayout] Verification link missing exchange credentials; treating as invalid or expired');
            authError = new Error('Missing verification credentials in deep link.');
          } else if (isRecoveryLink) {
            console.log('[RootLayout] Recovery link missing exchange credentials; treating as invalid or expired');
            authError = new Error('Missing recovery credentials in deep link.');
          } else {
            console.log('[RootLayout] Auth-like deep link without exchange credentials; leaving auth state unchanged');
          }

          if (authError) {
            console.log('[RootLayout] Auth deep link failed:', {
              action: authAction,
              error: authError,
              type: type ?? null,
            });

            if (isRecoveryLink) {
              console.log('[RootLayout] Routing to recovery failure screen');
              router.replace({
                pathname: '/auth/reset-password',
                params: {
                  error: 'recovery_failed',
                },
              } as any);
            } else {
              console.log('[RootLayout] Routing to verification failure screen');
              router.replace({
                pathname: '/auth/check-email',
                params: {
                  error: 'verification_failed',
                  email,
                },
              } as any);
            }
          } else if (isRecoveryLink) {
            console.log('[RootLayout] Recovery deep link succeeded; routing to reset password');
            router.replace('/auth/reset-password' as any);
          } else if (isVerificationLink || code || accessToken || refreshToken || tokenHash) {
            console.log('[RootLayout] Verification/auth deep link succeeded; routing to verified');
            router.replace('/auth/verified' as any);
          } else {
            console.log('[RootLayout] Auth-like deep link required no route change');
          }

          return;
        }

        if (path) {
          if (path.startsWith('truck/')) {
            const truckId = path.replace('truck/', '');
            if (truckId) {
              if (DEBUG) console.log('Navigating to truck:', truckId);
              console.log('[RootLayout] Routing to truck screen from deep link');
              router.push(`/truck/${truckId}` as any);
            }
          } else if (path.startsWith('public/')) {
            const truckId = path.replace('public/', '');
            if (truckId) {
              if (DEBUG) console.log('Navigating to public truck:', truckId);
              console.log('[RootLayout] Routing to public truck screen from deep link');
              router.push(`/public/${truckId}` as any);
            }
          }
        }
      } catch (error) {
        console.log('[RootLayout] Error handling deep link:', error);
      }
    };

    Linking.getInitialURL().then((url) => {
      if (url) {
        if (DEBUG) console.log('Initial URL:', url);
        handleDeepLink({ url });
      }
    }).catch((error) => {
      console.log('Error handling initial URL:', error);
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
