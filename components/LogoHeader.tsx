import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/contexts/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';

const LOGO = require('@/assets/images/icon.png');

export default function LogoHeader() {
  const { colors } = useTheme();
  const router = useRouter();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();

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
  logo: {
    width: 32,
    height: 32,
  },
});
