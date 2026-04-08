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

const getAuthLinkParams = (url: string) => {
  const [baseUrl, hash = ''] = url.split('#');
  const queryString = baseUrl.includes('?') ? baseUrl.split('?')[1] : '';
  const queryParams = new URLSearchParams(queryString);
  const hashParams = new URLSearchParams(hash);

  return {
    code: queryParams.get('code') ?? hashParams.get('code'),
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
    if (DEBUG) console.log('Deep link received:', event.url);

    const { code, accessToken, refreshToken, type, email } = getAuthLinkParams(event.url);
    const isAuthLink = !!(code || accessToken || refreshToken || type);

    // Let Supabase process auth links first
    if (isAuthLink) {
      let authError: unknown = null;

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        authError = error;
      } else if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        authError = error;
      } else {
        authError = new Error('Missing auth credentials in deep link.');
      }

if (authError) {
  console.log('Error handling auth deep link:', authError);

  if (type === 'recovery') {
    router.replace({
      pathname: '/auth/reset-password',
      params: {
        error: 'recovery_failed',
      },
    } as any);
  } else {
    router.replace({
      pathname: '/auth/check-email',
      params: {
        error: 'verification_failed',
        email,
      },
    } as any);
  }
} else {
  if (DEBUG) console.log('Auth session established from deep link');
  if (type === 'recovery') {
    router.replace('/auth/reset-password' as any);
  } else {
    router.replace('/auth/verified' as any);
  }
}

return;
    }

    const { path } = Linking.parse(event.url);

    if (path) {
      if (path.startsWith('truck/')) {
        const truckId = path.replace('truck/', '');
        if (truckId) {
          if (DEBUG) console.log('Navigating to truck:', truckId);
          router.push(`/truck/${truckId}` as any);
        }
      } else if (path.startsWith('public/')) {
        const truckId = path.replace('public/', '');
        if (truckId) {
          if (DEBUG) console.log('Navigating to public truck:', truckId);
          router.push(`/public/${truckId}` as any);
        }
      }
    }
  } catch (error) {
    console.log('Error handling deep link:', error);
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
