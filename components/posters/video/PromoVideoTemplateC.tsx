import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,

  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { FoodTruck } from '@/types';

type PromoVideoTemplateCProps = {
  truck: FoodTruck;
  qrDataUrl: string;
  isPlaying: boolean;
  duration: number;
};

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const SCALE = Dimensions.get('window').width / VIDEO_WIDTH;

export default function PromoVideoTemplateC({
  truck,
  qrDataUrl,
  isPlaying,
  duration,
}: PromoVideoTemplateCProps) {
  const splatter1Scale = useSharedValue(0);
  const splatter2Scale = useSharedValue(0);
  const splatter3Scale = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const posterScale = useSharedValue(0.7);
  const posterRotate = useSharedValue(-5);
  const titleOpacity = useSharedValue(0);
  const titleScale = useSharedValue(0.8);
  const underlineWidth = useSharedValue(0);
  const qrRotate = useSharedValue(-3);

  useEffect(() => {
    if (isPlaying) {
      splatter1Scale.value = withDelay(
        100,
        withSpring(1, { damping: 8, stiffness: 80 })
      );

      splatter2Scale.value = withDelay(
        300,
        withSpring(1, { damping: 8, stiffness: 80 })
      );

      splatter3Scale.value = withDelay(
        500,
        withSpring(1, { damping: 8, stiffness: 80 })
      );

      posterOpacity.value = withDelay(
        400,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) })
      );

      posterScale.value = withDelay(
        400,
        withSpring(1, { damping: 12, stiffness: 100, mass: 1 })
      );

      posterRotate.value = withDelay(
        400,
        withSpring(0, { damping: 10, stiffness: 80 })
      );

      titleOpacity.value = withDelay(
        900,
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) })
      );

      titleScale.value = withDelay(
        900,
        withSpring(1, { damping: 8, stiffness: 100 })
      );

      underlineWidth.value = withDelay(
        1200,
        withSpring(1, { damping: 10, stiffness: 80 })
      );

      qrRotate.value = withDelay(
        1000,
        withSpring(0, { damping: 8, stiffness: 60 })
      );
    } else {
      splatter1Scale.value = 0;
      splatter2Scale.value = 0;
      splatter3Scale.value = 0;
      posterOpacity.value = 0;
      posterScale.value = 0.7;
      posterRotate.value = -5;
      titleOpacity.value = 0;
      titleScale.value = 0.8;
      underlineWidth.value = 0;
      qrRotate.value = -3;
    }
  }, [isPlaying, duration]);

  const splatter1Style = useAnimatedStyle(() => ({
    transform: [{ scale: splatter1Scale.value }],
    opacity: interpolate(splatter1Scale.value, [0, 1], [0, 0.7]),
  }));

  const splatter2Style = useAnimatedStyle(() => ({
    transform: [{ scale: splatter2Scale.value }],
    opacity: interpolate(splatter2Scale.value, [0, 1], [0, 0.6]),
  }));

  const splatter3Style = useAnimatedStyle(() => ({
    transform: [{ scale: splatter3Scale.value }],
    opacity: interpolate(splatter3Scale.value, [0, 1], [0, 0.5]),
  }));

  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
    transform: [
      { scale: posterScale.value },
      { rotate: `${posterRotate.value}deg` },
    ],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ scale: titleScale.value }],
  }));

  const underlineAnimatedStyle = useAnimatedStyle(() => ({
    width: interpolate(underlineWidth.value, [0, 1], [0, 500]),
  }));

  const qrAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${qrRotate.value}deg` }],
  }));

  return (
    <View style={[styles.container, { transform: [{ scale: SCALE }] }]}>
      <LinearGradient
        colors={['#FFE066', '#FF9966', '#FF6B9D']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <Animated.View style={[styles.splatter1, splatter1Style]} />
      <Animated.View style={[styles.splatter2, splatter2Style]} />
      <Animated.View style={[styles.splatter3, splatter3Style]} />

      <View style={styles.content}>
        <Animated.View style={[styles.posterCard, posterAnimatedStyle]}>
          <View style={styles.paintFrame} />

          <View style={styles.heroContainer}>
            <Image
              source={{ uri: truck.hero_image }}
              style={styles.heroImage}
              contentFit="cover"
            />
          </View>

          <View style={styles.posterContent}>
            {truck.logo ? (
              <View style={styles.logoContainer}>
                <View style={styles.paintSplash} />
                <Image
                  source={{ uri: truck.logo }}
                  style={styles.logo}
                  contentFit="cover"
                />
              </View>
            ) : null}

            <Animated.View style={titleAnimatedStyle}>
              <Text style={styles.truckName}>{truck.name}</Text>
              <Animated.View style={[styles.brushUnderline, underlineAnimatedStyle]} />
            </Animated.View>

            <View style={styles.cuisineBadge}>
              <View style={styles.splashBg} />
              <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>
            </View>

            <Animated.View style={[styles.qrSection, qrAnimatedStyle]}>
              <View style={styles.qrPaintFrame} />
              <View style={styles.qrWrapper}>
                <Image
                  source={{ uri: qrDataUrl }}
                  style={styles.qrImage}
                  contentFit="contain"
                />
              </View>
              <Text style={styles.scanText}>SCAN ME!</Text>
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
    backgroundColor: '#FFF',
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
  },
  splatter1: {
    position: 'absolute',
    top: 100,
    left: 50,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: '#FF3366',
  },
  splatter2: {
    position: 'absolute',
    top: 1200,
    right: 80,
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: '#3366FF',
  },
  splatter3: {
    position: 'absolute',
    bottom: 150,
    left: 100,
    width: 350,
    height: 350,
    borderRadius: 175,
    backgroundColor: '#FFCC00',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  posterCard: {
    width: 880,
    backgroundColor: Colors.light,
    borderRadius: 48,
    overflow: 'hidden',
  },
  paintFrame: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 20,
    borderColor: '#FF6600',
    borderRadius: 48,
    zIndex: 1,
  },
  heroContainer: {
    width: '100%',
    height: 480,
    backgroundColor: Colors.lightGray,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  posterContent: {
    padding: 60,
    alignItems: 'center',
  },
  logoContainer: {
    width: 160,
    height: 160,
    borderRadius: 80,
    overflow: 'hidden',
    marginTop: -100,
    marginBottom: 40,
    borderWidth: 8,
    borderColor: '#FF6600',
    backgroundColor: Colors.light,
    transform: [{ rotate: '-5deg' }],
  },
  paintSplash: {
    position: 'absolute',
    top: -30,
    left: -30,
    right: -30,
    bottom: -30,
    borderRadius: 95,
    backgroundColor: '#FFCC00',
    opacity: 0.4,
    zIndex: -1,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  truckName: {
    fontSize: 72,
    fontWeight: '900' as const,
    color: '#222',
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: -1,
    transform: [{ rotate: '-1deg' }],
  },
  brushUnderline: {
    height: 12,
    backgroundColor: '#FF6600',
    borderRadius: 6,
    marginBottom: 32,
  },
  cuisineBadge: {
    paddingHorizontal: 48,
    paddingVertical: 20,
    borderRadius: 20,
    marginBottom: 48,
    transform: [{ rotate: '2deg' }],
  },
  splashBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FF3366',
    borderRadius: 20,
    transform: [{ rotate: '-3deg' }],
  },
  cuisineText: {
    fontSize: 28,
    fontWeight: '800' as const,
    color: Colors.light,
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  qrPaintFrame: {
    position: 'absolute',
    top: -20,
    left: -20,
    right: -20,
    bottom: 50,
    backgroundColor: 'transparent',
    borderWidth: 12,
    borderColor: '#3366FF',
    borderRadius: 40,
    transform: [{ rotate: '2deg' }],
  },
  qrWrapper: {
    backgroundColor: Colors.light,
    padding: 32,
    borderRadius: 32,
    borderWidth: 8,
    borderColor: '#FF6600',
  },
  qrImage: {
    width: 420,
    height: 420,
  },
  scanText: {
    fontSize: 36,
    fontWeight: '900' as const,
    color: '#FF3366',
    marginTop: 32,
    letterSpacing: 3,
    transform: [{ rotate: '-2deg' }],
  },
  footer: {
    alignItems: 'center',
    marginTop: 20,
  },
  footerText: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.gray,
    letterSpacing: 2,
    marginBottom: 8,
  },
  footerBrand: {
    fontSize: 36,
    fontWeight: '900' as const,
    color: '#FF6600',
    letterSpacing: 2,
  },
});
