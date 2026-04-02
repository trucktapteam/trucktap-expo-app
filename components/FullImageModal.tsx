import React, { useRef } from 'react';
import {
  Modal,
  TouchableOpacity,
  StyleSheet,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';

type FullImageModalProps = {
  visible: boolean;
  onClose: () => void;
  image: string | null;
  truckId?: string;
  onPhotoView?: () => void;
};

const { width, height } = Dimensions.get('window');

export default function FullImageModal({ visible, onClose, image, onPhotoView }: FullImageModalProps) {
  const hasTracked = React.useRef(false);

  React.useEffect(() => {
    if (visible && !hasTracked.current && onPhotoView) {
      onPhotoView();
      hasTracked.current = true;
    }
    if (!visible) {
      hasTracked.current = false;
    }
  }, [visible, onPhotoView]);
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTranslateX = useRef(0);
  const lastTranslateY = useRef(0);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 5 || Math.abs(gestureState.dy) > 5;
      },
      onPanResponderGrant: () => {
        scale.setOffset(lastScale.current - 1);
        translateX.setOffset(lastTranslateX.current);
        translateY.setOffset(lastTranslateY.current);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.numberActiveTouches === 2) {
          const distance = Math.sqrt(
            Math.pow(gestureState.dx, 2) + Math.pow(gestureState.dy, 2)
          );
          const newScale = Math.max(1, Math.min(3, distance / 100));
          scale.setValue(newScale);
        } else if (gestureState.numberActiveTouches === 1) {
          if (lastScale.current > 1) {
            translateX.setValue(gestureState.dx);
            translateY.setValue(gestureState.dy);
          } else if (gestureState.dy > 50) {
            translateY.setValue(gestureState.dy);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        scale.flattenOffset();
        translateX.flattenOffset();
        translateY.flattenOffset();

        scale.addListener(({ value }) => {
          lastScale.current = value;
        });
        translateX.addListener(({ value }) => {
          lastTranslateX.current = value;
        });
        translateY.addListener(({ value }) => {
          lastTranslateY.current = value;
        });

        if (gestureState.dy > 100 && lastScale.current === 1) {
          onClose();
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start(() => {
            lastScale.current = 1;
            lastTranslateX.current = 0;
            lastTranslateY.current = 0;
          });
        } else if (lastScale.current < 1.1) {
          Animated.parallel([
            Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, useNativeDriver: true }),
            Animated.spring(translateY, { toValue: 0, useNativeDriver: true }),
          ]).start(() => {
            lastScale.current = 1;
            lastTranslateX.current = 0;
            lastTranslateY.current = 0;
          });
        }
      },
    })
  ).current;

  const handleBackgroundTap = () => {
    if (lastScale.current === 1) {
      onClose();
    }
  };

  if (!image) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity
        style={styles.background}
        activeOpacity={1}
        onPress={handleBackgroundTap}
      >
        <TouchableOpacity style={styles.closeButton} onPress={onClose} activeOpacity={0.7}>
          <X size={32} color="white" />
        </TouchableOpacity>

        <Animated.View
          style={[
            styles.imageContainer,
            {
              transform: [
                { scale },
                { translateX },
                { translateY },
              ],
            },
          ]}
          {...panResponder.panHandlers}
        >
          <Image
            source={{ uri: image }}
            style={styles.image}
            contentFit="contain"
          />
        </Animated.View>
      </TouchableOpacity>
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
    width: width,
    height: height * 0.8,
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
