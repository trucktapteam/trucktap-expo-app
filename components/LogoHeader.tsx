import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useApp } from '@/contexts/AppContext';
import ModeSwitchToggle from '@/components/ModeSwitchToggle';

const LOGO = require('@/assets/images/icon.png');

type LogoHeaderProps = {
  showModeSwitch?: boolean;
};

export default function LogoHeader({ showModeSwitch = true }: LogoHeaderProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const { signOut, user, isAuthenticated } = useAuth();
  const { currentUser, isOwner } = useApp();
  const insets = useSafeAreaInsets();
  const canOpenOwnerDashboard =
    showModeSwitch &&
    isAuthenticated &&
    (isOwner || currentUser?.role === 'truck' || currentUser?.role === 'admin');

  const handleDebugClear = async () => {
    if (!__DEV__) return;

    Alert.alert(
      'Debug: Clear All Data',
      'This will clear all app data and reload. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear & Reload',
          style: 'destructive',
          onPress: async () => {
            try {
              console.log('[LogoHeader] Debug auth/data clear requested:', {
                file: 'components/LogoHeader.tsx',
                functionName: 'handleDebugClear',
                reason: 'Developer long-press Clear & Reload action',
                userId: user?.id ?? null,
                email: user?.email ?? null,
                sessionExists: isAuthenticated,
              });
              console.log('[DEBUG] Clearing all AsyncStorage data...');
              await AsyncStorage.clear();
              console.log('[DEBUG] Signing out...');
              await signOut();
              console.log('[DEBUG] Navigating to index...');
              router.replace('/');
              Alert.alert('Debug', 'All data cleared! App will reload.');
            } catch (error) {
              console.log('[DEBUG] Error clearing data:', error);
              Alert.alert('Debug Error', 'Failed to clear data. Check console.');
            }
          }
        }
      ]
    );
  };
  
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={styles.titleContainer}>
        <Text style={[styles.title, { color: colors.text }]}>TruckTap</Text>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>Find your next meal</Text>
      </View>
      <View style={styles.rightControls}>
        {canOpenOwnerDashboard ? (
          <ModeSwitchToggle
            mode="customer"
            compact
            onPress={() => router.push('/(truck)/(tabs)/dashboard' as any)}
          />
        ) : null}

        <TouchableOpacity
          onLongPress={__DEV__ ? handleDebugClear : undefined}
          delayLongPress={2000}
          disabled={!__DEV__}
          activeOpacity={__DEV__ ? 0.7 : 1}
          style={styles.logoContainer}
        >
          <Image
            source={LOGO}
            style={styles.logo}
            contentFit="contain"
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  titleContainer: {
    flex: 1,
    paddingRight: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '700' as const,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  logoContainer: {
    padding: 4,
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  logo: {
    width: 32,
    height: 32,
  },
});
