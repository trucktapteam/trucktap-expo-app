import React from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import { Truck } from 'lucide-react-native';

type TruckMapMarkerProps = {
  imageUrl?: string | null;
  isOpen: boolean;
  scale?: Animated.Value | number;
};

export default function TruckMapMarker({
  imageUrl,
  isOpen,
  scale = 1,
}: TruckMapMarkerProps) {
  const ringColor = isOpen ? '#f97316' : '#9ca3af';
  const hasImage = !!imageUrl;

  if (Platform.OS === 'android') {
    return (
      <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
        <View style={[styles.androidMarker, { borderColor: ringColor }]}>
          <View style={[styles.androidDot, { backgroundColor: ringColor }]} />
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.wrapper, { transform: [{ scale }] }]}>
      <View style={[styles.iosMarker, { borderColor: ringColor }]}>
        {hasImage ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.image}
            contentFit="cover"
            contentPosition="center"
          />
        ) : (
          <View style={styles.fallback}>
            <Truck size={20} color={ringColor} strokeWidth={2.2} />
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  androidDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  iosMarker: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#111827',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
  },
});
