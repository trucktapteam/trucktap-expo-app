import React from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type FullImageModalProps = {
  visible: boolean;
  onClose: () => void;
  image: string | null;
  truckId?: string;
  onPhotoView?: () => void;
};

const MAX_SCALE = 4;

const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(Math.max(value, min), max);
};

export default function FullImageModal({ visible, onClose, image, onPhotoView }: FullImageModalProps) {
  const { width, height } = useWindowDimensions();
  const hasTracked = React.useRef(false);

  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  React.useEffect(() => {
    if (visible && !hasTracked.current && onPhotoView) {
      onPhotoView();
      hasTracked.current = true;
    }
    if (!visible) {
      hasTracked.current = false;
    }
  }, [visible, onPhotoView]);

  React.useEffect(() => {
    scale.value = withTiming(1, { duration: 120 });
    savedScale.value = 1;
    translateX.value = withTiming(0, { duration: 120 });
    translateY.value = withTiming(0, { duration: 120 });
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [image, savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY, visible]);

  const resetImage = React.useCallback(() => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  }, [savedScale, savedTranslateX, savedTranslateY, scale, translateX, translateY]);

  const pinchGesture = Gesture.Pinch()
    .onBegin(() => {
      savedScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = clamp(savedScale.value * event.scale, 1, MAX_SCALE);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1.02) {
        scale.value = withSpring(1);
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      }
    });

  const panGesture = Gesture.Pan()
    .minDistance(2)
    .onBegin(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) {
        return;
      }

      const maxTranslateX = (width * (scale.value - 1)) / 2;
      const maxTranslateY = (height * 0.85 * (scale.value - 1)) / 2;
      translateX.value = clamp(savedTranslateX.value + event.translationX, -maxTranslateX, maxTranslateX);
      translateY.value = clamp(savedTranslateY.value + event.translationY, -maxTranslateY, maxTranslateY);
    })
    .onEnd(() => {
      if (scale.value <= 1) {
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2);
        savedScale.value = 2;
      }
    });

  const imageGesture = Gesture.Simultaneous(doubleTapGesture, pinchGesture, panGesture);

  const imageStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  if (!image) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.background}>
        <Pressable
          style={styles.closeButton}
          onPress={() => {
            resetImage();
            onClose();
          }}
          accessibilityRole="button"
          accessibilityLabel="Close image viewer"
        >
          <X size={32} color="white" />
        </Pressable>

        <GestureDetector gesture={imageGesture}>
          <Animated.View style={[styles.imageContainer, { width, height: height * 0.85 }, imageStyle]}>
            <Image
              source={{ uri: image }}
              style={styles.image}
              contentFit="contain"
            />
          </Animated.View>
        </GestureDetector>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  closeButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    zIndex: 20,
    padding: 8,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
});
