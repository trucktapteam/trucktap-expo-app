import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { MapPin } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp } from '@/contexts/AppContext';

export default function OnboardingLocationScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { completeOnboarding } = useApp();
  const [isRequesting, setIsRequesting] = useState(false);

  const finishOnboarding = () => {
    completeOnboarding();
    router.replace('/(customer)/(tabs)/discover' as any);
  };

  const handleAllowLocation = async () => {
    if (Platform.OS === 'web') {
      finishOnboarding();
      return;
    }

    setIsRequesting(true);
    try {
      await Location.requestForegroundPermissionsAsync();
    } catch (error) {
      console.error('[OnboardingLocation] Error requesting location permission:', error);
    } finally {
      setIsRequesting(false);
      finishOnboarding();
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: `${colors.primary}15` }]}>
          <MapPin size={56} color={colors.primary} strokeWidth={2} />
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Find trucks near you</Text>
        <Text style={[styles.body, { color: colors.secondaryText }]}>
          TruckTap uses your location to show food trucks that are close by and LIVE right
          now. We only use it while you&apos;re using the app.
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }, isRequesting && styles.buttonDisabled]}
            onPress={handleAllowLocation}
            disabled={isRequesting}
            activeOpacity={0.85}
          >
            {isRequesting ? (
              <ActivityIndicator color={colors.background} />
            ) : (
              <Text style={[styles.primaryButtonText, { color: colors.background }]}>Allow Location Access</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={finishOnboarding}
            disabled={isRequesting}
            activeOpacity={0.7}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.secondaryText }]}>Not Now</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 16,
    lineHeight: 23,
    textAlign: 'center',
    marginBottom: 48,
    maxWidth: 320,
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    fontSize: 18,
    fontWeight: '600' as const,
  },
  secondaryButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
  },
});
