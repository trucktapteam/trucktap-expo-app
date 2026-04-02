import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { FoodTruck } from '@/types';

export type AnimatedPosterProps = {
  truck: FoodTruck;
  qrDataUrl: string;
  isPlaying?: boolean;
};

export function useQRPulse(isPlaying: boolean = true) {
  const scale = useSharedValue(1);

  useEffect(() => {
    if (isPlaying) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(scale);
      scale.value = 1;
    }

    return () => {
      cancelAnimation(scale);
    };
  }, [isPlaying, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return animatedStyle;
}

export function useFadeInSlide(isPlaying: boolean = true, delay: number = 0) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(8);

  useEffect(() => {
    if (isPlaying) {
      opacity.value = 0;
      translateY.value = 8;
      
      setTimeout(() => {
        opacity.value = withTiming(1, { duration: 1000, easing: Easing.out(Easing.ease) });
        translateY.value = withTiming(0, { duration: 1000, easing: Easing.out(Easing.ease) });
      }, delay);
    } else {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
      opacity.value = 1;
      translateY.value = 0;
    }

    return () => {
      cancelAnimation(opacity);
      cancelAnimation(translateY);
    };
  }, [isPlaying, delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return animatedStyle;
}

export function useWiggle(isPlaying: boolean = true, delay: number = 0) {
  const rotation = useSharedValue(0);

  useEffect(() => {
    if (isPlaying) {
      setTimeout(() => {
        rotation.value = withRepeat(
          withSequence(
            withTiming(-2, { duration: 400, easing: Easing.elastic(1.2) }),
            withTiming(2, { duration: 800, easing: Easing.elastic(1.2) }),
            withTiming(0, { duration: 400, easing: Easing.elastic(1.2) })
          ),
          -1,
          false
        );
      }, delay);
    } else {
      cancelAnimation(rotation);
      rotation.value = 0;
    }

    return () => {
      cancelAnimation(rotation);
    };
  }, [isPlaying, delay, rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return animatedStyle;
}

export function useGlowCycle(
  isPlaying: boolean = true,
  colors: string[] = ['#FF6800', '#00E5FF', '#FF3366']
) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isPlaying) {
      progress.value = withRepeat(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        -1,
        false
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }

    return () => {
      cancelAnimation(progress);
    };
  }, [isPlaying, progress]);

  return progress;
}
