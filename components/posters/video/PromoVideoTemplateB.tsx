import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';

import { FoodTruck } from '@/types';

type PromoVideoTemplateBProps = {
  truck: FoodTruck;
  qrDataUrl: string;
  isPlaying: boolean;
  duration: number;
};

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const SCALE = Dimensions.get('window').width / VIDEO_WIDTH;

export default function PromoVideoTemplateB({
  truck,
  qrDataUrl,
  isPlaying,
  duration,
}: PromoVideoTemplateBProps) {
  const glowPulse = useSharedValue(0);
  const scanlineProgress = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const posterScale = useSharedValue(0.9);
  const titleOpacity = useSharedValue(0);
  const titleFlicker = useSharedValue(1);
  const qrPulse = useSharedValue(1);

  useEffect(() => {
    if (isPlaying) {
      glowPulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1800, easing: Easing.inOut(Easing.sin) })
        ),
        -1,
        false
      );

      scanlineProgress.value = withRepeat(
        withTiming(1, { duration: 2000, easing: Easing.linear }),
        -1,
        false
      );

      posterOpacity.value = withDelay(
        300,
        withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) })
      );

      posterScale.value = withDelay(
        300,
        withSequence(
          withTiming(1, { duration: 1000, easing: Easing.out(Easing.back(1.1)) }),
          withTiming(1, { duration: (duration - 1.3) * 1000 })
        )
      );

      titleOpacity.value = withDelay(
        800,
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) })
      );

      titleFlicker.value = withDelay(
        800,
        withRepeat(
          withSequence(
            withTiming(0.9, { duration: 100 }),
            withTiming(1, { duration: 100 }),
            withTiming(0.95, { duration: 100 }),
            withTiming(1, { duration: 1700 })
          ),
          -1,
          false
        )
      );

      qrPulse.value = withDelay(
        1200,
        withRepeat(
          withSequence(
            withTiming(0.96, { duration: 800, easing: Easing.inOut(Easing.sin) }),
            withTiming(1.01, { duration: 800, easing: Easing.inOut(Easing.sin) })
          ),
          -1,
          false
        )
      );
    } else {
      glowPulse.value = 0;
      scanlineProgress.value = 0;
      posterOpacity.value = 0;
      posterScale.value = 0.9;
      titleOpacity.value = 0;
      titleFlicker.value = 1;
      qrPulse.value = 1;
    }
  }, [isPlaying, duration]);

  const glowAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(glowPulse.value, [0, 1], [0.6, 1]);
    const scale = interpolate(glowPulse.value, [0, 1], [1, 1.1]);
    return {
      opacity,
      transform: [{ scale }],
    };
  });

  const scanlineAnimatedStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scanlineProgress.value,
      [0, 1],
      [-VIDEO_HEIGHT, VIDEO_HEIGHT]
    );
    return {
      transform: [{ translateY }],
    };
  });

  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
    transform: [{ scale: posterScale.value }],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value * titleFlicker.value,
  }));

  const qrAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: qrPulse.value }],
  }));

  return (
    <View style={[styles.container, { transform: [{ scale: SCALE }] }]}>
      <LinearGradient
        colors={['#0A0A0A', '#1A0F2E', '#0F0F1A']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View style={[styles.scanline, scanlineAnimatedStyle]} />

      <View style={styles.content}>
        <Animated.View style={[styles.posterCard, posterAnimatedStyle]}>
          <Animated.View style={[styles.glowRing, glowAnimatedStyle]} />

          <View style={styles.heroContainer}>
            <Image
              source={{ uri: truck.hero_image }}
              style={styles.heroImage}
              contentFit="cover"
            />
            <LinearGradient
              colors={['rgba(255,100,0,0.3)', 'rgba(0,200,255,0.2)', 'transparent']}
              style={styles.heroOverlay}
            />
          </View>

          <View style={styles.posterContent}>
            {truck.logo ? (
              <View style={styles.logoContainer}>
                <Animated.View style={[styles.logoGlow, glowAnimatedStyle]} />
                <Image
                  source={{ uri: truck.logo }}
                  style={styles.logo}
                  contentFit="cover"
                />
              </View>
            ) : null}

            <Animated.View style={titleAnimatedStyle}>
              <Text style={styles.truckName}>{truck.name}</Text>
              <View style={styles.neonUnderline} />
            </Animated.View>

            <View style={styles.cuisineBadge}>
              <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>
            </View>

            <Animated.View style={[styles.qrSection, qrAnimatedStyle]}>
              <Animated.View style={[styles.qrGlow, glowAnimatedStyle]} />
              <View style={styles.qrWrapper}>
                <Image
                  source={{ uri: qrDataUrl }}
                  style={styles.qrImage}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.scanText}>SCAN NOW</Text>
            </Animated.View>

            <View style={styles.footer}>
              <Text style={styles.footerText}>POWERED BY</Text>
              <Text style={styles.footerBrand}>TRUCKTAP</Text>
            </View>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    backgroundColor: '#000',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  scanline: {
    position: 'absolute',
    width: '100%',
    height: 3,
    backgroundColor: 'rgba(0, 255, 255, 0.3)',
    shadowColor: '#00FFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  posterCard: {
    width: 880,
    backgroundColor: '#111',
    borderRadius: 48,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#FF6600',
  },
  glowRing: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: -20,
    borderRadius: 68,
    backgroundColor: 'transparent',
    borderWidth: 8,
    borderColor: '#FF6600',
    shadowColor: '#FF6600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
    zIndex: -1,
  },
  heroContainer: {
    width: '100%',
    height: 480,
    backgroundColor: '#000',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  posterContent: {
    padding: 60,
    alignItems: 'center',
  },
  logoContainer: {
    width: 160,
    height: 160,
    borderRadius: 32,
    overflow: 'hidden',
    marginTop: -100,
    marginBottom: 40,
    borderWidth: 6,
    borderColor: '#00D9FF',
    backgroundColor: '#111',
  },
  logoGlow: {
    position: 'absolute',
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    borderRadius: 42,
    backgroundColor: 'transparent',
    borderWidth: 4,
    borderColor: '#00D9FF',
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 30,
    zIndex: -1,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  truckName: {
    fontSize: 72,
    fontWeight: '900' as const,
    color: '#FFF',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -1,
    textShadowColor: '#FF6600',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  neonUnderline: {
    width: 300,
    height: 6,
    backgroundColor: '#FF6600',
    marginBottom: 32,
    shadowColor: '#FF6600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  cuisineBadge: {
    backgroundColor: '#00D9FF',
    paddingHorizontal: 48,
    paddingVertical: 20,
    borderRadius: 16,
    marginBottom: 48,
    shadowColor: '#00D9FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
  },
  cuisineText: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: '#000',
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  qrGlow: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: 60,
    borderRadius: 52,
    backgroundColor: 'transparent',
    borderWidth: 6,
    borderColor: '#FF6600',
    shadowColor: '#FF6600',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 40,
    zIndex: -1,
  },
  qrWrapper: {
    backgroundColor: '#FFF',
    padding: 32,
    borderRadius: 32,
    borderWidth: 6,
    borderColor: '#FF6600',
  },
  qrImage: {
    width: 420,
    height: 420,
  },
  scanText: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: '#FF6600',
    marginTop: 32,
    letterSpacing: 3,
    textShadowColor: '#FF6600',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: '#666',
    letterSpacing: 2,
    marginBottom: 8,
  },
  footerBrand: {
    fontSize: 36,
    fontWeight: '900' as const,
    color: '#FF6600',
    letterSpacing: 2,
    textShadowColor: '#FF6600',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
