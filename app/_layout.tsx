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

    // Let Supabase process auth links first
    if (
      event.url.includes('access_token=') ||
      event.url.includes('refresh_token=') ||
      event.url.includes('type=signup') ||
      event.url.includes('type=magiclink') ||
      event.url.includes('type=recovery')
    ) {
      const { error } = await supabase.auth.exchangeCodeForSession(event.url);
      if (error) {
        console.log('Error exchanging auth code for session:', error);
      } else {
        if (DEBUG) console.log('Auth session established from deep link');
        router.replace('/(customer)' as any);
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
