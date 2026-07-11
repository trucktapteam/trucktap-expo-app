import React from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

export type FullscreenImageViewerProps = {
  visible: boolean;
  image: string | null;
  onClose: () => void;
  accessibilityLabel?: string;
  onPhotoView?: () => void;
};

const MAX_SCALE = 4;
const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(Math.max(value, min), max);
};

export default function FullscreenImageViewer({
  visible,
  image,
  onClose,
  accessibilityLabel = 'Fullscreen image',
  onPhotoView,
}: FullscreenImageViewerProps) {
  const { width, height } = useWindowDimensions();
  const hasTracked = React.useRef(false);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);
  const presentationScale = useSharedValue(0.96);

  React.useEffect(() => {
    if (visible && !hasTracked.current && onPhotoView) {
      onPhotoView();
      hasTracked.current = true;
    } else if (!visible) {
      hasTracked.current = false;
    }
  }, [visible, onPhotoView]);

  React.useEffect(() => {
    scale.value = 1;
    savedScale.value = 1;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    presentationScale.value = visible ? withTiming(1, { duration: 180 }) : 0.96;
  }, [image, presentationScale, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, visible]);

  const close = React.useCallback(() => {
    scale.value = withSpring(1);
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    onClose();
  }, [onClose, scale, translateX, translateY]);

  const pinch = Gesture.Pinch().onBegin(() => {
    savedScale.value = scale.value;
  }).onUpdate((event) => {
    scale.value = clamp(savedScale.value * event.scale, 1, MAX_SCALE);
  }).onEnd(() => {
    savedScale.value = scale.value;
    if (scale.value <= 1.02) {
      scale.value = withSpring(1);
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    }
  });

  const pan = Gesture.Pan().minDistance(2).onBegin(() => {
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  }).onUpdate((event) => {
    if (scale.value <= 1) return;
    const maxX = (width * (scale.value - 1)) / 2;
    const maxY = (height * 0.85 * (scale.value - 1)) / 2;
    translateX.value = clamp(savedTranslateX.value + event.translationX, -maxX, maxX);
    translateY.value = clamp(savedTranslateY.value + event.translationY, -maxY, maxY);
  }).onEnd(() => {
    savedTranslateX.value = translateX.value;
    savedTranslateY.value = translateY.value;
  });

  const doubleTap = Gesture.Tap().numberOfTaps(2).onEnd(() => {
    const zoomed = scale.value > 1;
    scale.value = withSpring(zoomed ? 1 : 2);
    savedScale.value = zoomed ? 1 : 2;
    if (zoomed) {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
    }
  });

  const animatedImageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value * presentationScale.value },
    ],
  }));

  if (!image) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={styles.background}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close image viewer background" />
        <GestureDetector gesture={Gesture.Simultaneous(doubleTap, pinch, pan)}>
          <Animated.View style={[styles.imageContainer, { width, height: height * 0.85 }, animatedImageStyle]}>
            <Image source={{ uri: image }} style={styles.image} contentFit="contain" accessibilityLabel={accessibilityLabel} />
          </Animated.View>
        </GestureDetector>
        <Pressable style={styles.closeButton} onPress={close} accessibilityRole="button" accessibilityLabel="Close image viewer" hitSlop={8}>
          <X size={30} color="white" />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: 'rgba(0,0,0,0.96)', justifyContent: 'center', alignItems: 'center' },
  imageContainer: { justifyContent: 'center', alignItems: 'center' },
  image: { width: '100%', height: '100%' },
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 20, padding: 8, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 24 },
});
