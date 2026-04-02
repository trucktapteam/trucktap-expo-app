import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withDelay,
  Easing,

} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import Colors from '@/constants/colors';
import { FoodTruck } from '@/types';

type PromoVideoTemplateAProps = {
  truck: FoodTruck;
  qrDataUrl: string;
  isPlaying: boolean;
  duration: number;
};

const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;
const SCALE = Dimensions.get('window').width / VIDEO_WIDTH;

export default function PromoVideoTemplateA({
  truck,
  qrDataUrl,
  isPlaying,
  duration,
}: PromoVideoTemplateAProps) {
  const gradientProgress = useSharedValue(0);
  const posterOpacity = useSharedValue(0);
  const posterScale = useSharedValue(0.85);
  const titleOpacity = useSharedValue(0);
  const titleTranslateX = useSharedValue(-50);
  const cuisineOpacity = useSharedValue(0);
  const ctaOpacity = useSharedValue(0);
  const qrFloat = useSharedValue(0);

  useEffect(() => {
    if (isPlaying) {
      gradientProgress.value = withTiming(1, {
        duration: duration * 1000,
        easing: Easing.inOut(Easing.ease),
      });

      posterOpacity.value = withDelay(
        200,
        withTiming(1, { duration: 800, easing: Easing.out(Easing.quad) })
      );

      posterScale.value = withDelay(
        200,
        withSequence(
          withTiming(1, { duration: 800, easing: Easing.out(Easing.back(1.2)) }),
          withTiming(1, { duration: (duration - 1) * 1000 })
        )
      );

      titleOpacity.value = withDelay(
        600,
        withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) })
      );

      titleTranslateX.value = withDelay(
        600,
        withTiming(0, { duration: 600, easing: Easing.out(Easing.quad) })
      );

      cuisineOpacity.value = withDelay(
        1000,
        withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) })
      );

      ctaOpacity.value = withDelay(
        1400,
        withTiming(1, { duration: 500, easing: Easing.out(Easing.quad) })
      );

      qrFloat.value = withDelay(
        1200,
        withSequence(
          withTiming(-3, { duration: 1500, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1500, easing: Easing.inOut(Easing.sin) })
        )
      );
    } else {
      gradientProgress.value = 0;
      posterOpacity.value = 0;
      posterScale.value = 0.85;
      titleOpacity.value = 0;
      titleTranslateX.value = -50;
      cuisineOpacity.value = 0;
      ctaOpacity.value = 0;
      qrFloat.value = 0;
    }
  }, [isPlaying, duration]);



  const posterAnimatedStyle = useAnimatedStyle(() => ({
    opacity: posterOpacity.value,
    transform: [{ scale: posterScale.value }],
  }));

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [{ translateX: titleTranslateX.value }],
  }));

  const cuisineAnimatedStyle = useAnimatedStyle(() => ({
    opacity: cuisineOpacity.value,
  }));

  const ctaAnimatedStyle = useAnimatedStyle(() => ({
    opacity: ctaOpacity.value,
  }));

  const qrAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: qrFloat.value }],
  }));

  return (
    <View style={[styles.container, { transform: [{ scale: SCALE }] }]}>
      <LinearGradient
        colors={['#FFF5ED', '#FFE8D6', '#FFDEC4']}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.content}>
        <Animated.View style={[styles.posterCard, posterAnimatedStyle]}>
          <View style={styles.heroContainer}>
            <Image
              source={{ uri: truck.hero_image }}
              style={styles.heroImage}
              contentFit="cover"
            />
            <View style={styles.heroOverlay} />
          </View>

          <View style={styles.posterContent}>
            {truck.logo ? (
              <View style={styles.logoContainer}>
                <Image
                  source={{ uri: truck.logo }}
                  style={styles.logo}
                  contentFit="cover"
                />
              </View>
            ) : null}

            <Animated.View style={titleAnimatedStyle}>
              <Text style={styles.truckName}>{truck.name}</Text>
            </Animated.View>

            <Animated.View style={cuisineAnimatedStyle}>
              <View style={styles.cuisineBadge}>
                <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>
              </View>
            </Animated.View>

            <Animated.View style={[styles.qrSection, qrAnimatedStyle]}>
              <View style={styles.qrWrapper}>
                <Image
                  source={{ uri: qrDataUrl }}
                  style={styles.qrImage}
                  contentFit="contain"
                />
              </View>
              <Animated.View style={ctaAnimatedStyle}>
                <Text style={styles.scanText}>SCAN FOR MENU</Text>
              </Animated.View>
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
    backgroundColor: Colors.light,
  },
  gradient: {
    ...StyleSheet.absoluteFillObject,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
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
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.1)',
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
    borderWidth: 8,
    borderColor: Colors.primary,
    backgroundColor: Colors.light,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 12,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  truckName: {
    fontSize: 72,
    fontWeight: '900' as const,
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: -1,
  },
  cuisineBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 48,
    paddingVertical: 20,
    borderRadius: 16,
    marginBottom: 48,
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
  qrWrapper: {
    backgroundColor: Colors.light,
    padding: 32,
    borderRadius: 32,
    borderWidth: 8,
    borderColor: Colors.primary,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  qrImage: {
    width: 420,
    height: 420,
  },
  scanText: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: Colors.primary,
    marginTop: 32,
    letterSpacing: 2,
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
    color: Colors.primary,
    letterSpacing: 2,
  },
});
