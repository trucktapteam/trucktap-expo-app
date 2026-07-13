import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Colors from '@/constants/colors';
import { LinearGradient } from 'expo-linear-gradient';

const LOGO = require('@/assets/images/icon.png');

export default function OnboardingScreen() {
  const router = useRouter();

  return (
    <LinearGradient
      colors={[Colors.primary, '#FF8C42']}
      style={styles.container}
    >
      <View style={styles.content}>
        <View style={styles.logoShadow}>
          <Image source={LOGO} style={styles.logo} contentFit="contain" />
        </View>

        <Text style={styles.title}>TruckTap</Text>
        <Text style={styles.subtitle}>
          Know who&apos;s open.{'\n'}Before you go.
        </Text>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={styles.button}
            onPress={() => router.push('/role-select' as any)}
          >
            <Text style={styles.buttonText}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </View>
    </LinearGradient>
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
  logoShadow: {
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 18,
    elevation: 10,
  },
  logo: {
    width: 176,
    height: 176,
    borderRadius: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: '700' as const,
    color: Colors.light,
    marginBottom: 14,
    letterSpacing: -1,
  },
  subtitle: {
    fontSize: 23,
    fontWeight: '600' as const,
    lineHeight: 30,
    color: Colors.light,
    textAlign: 'center',
    opacity: 0.95,
    marginBottom: 64,
  },
  buttonContainer: {
    width: '100%',
    gap: 16,
  },
  button: {
    backgroundColor: Colors.light,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
});
