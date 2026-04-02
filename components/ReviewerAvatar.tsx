import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Colors from '@/constants/colors';

type ReviewerAvatarProps = {
  name: string;
  photo?: string;
  size?: number;
};

export default function ReviewerAvatar({ name, photo, size = 44 }: ReviewerAvatarProps) {
  const getInitials = (fullName: string) => {
    const parts = fullName.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    }
    return fullName.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(name);
  const hasPhoto = typeof photo === 'string' && photo.trim().length > 0;

  if (hasPhoto) {
    return (
      <Image
        source={{ uri: photo }}
        style={[
          styles.image,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
      />
    );
  }

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.initials, { fontSize: size * 0.4 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initials: {
    color: Colors.light,
    fontWeight: '700' as const,
  },
  image: {
    backgroundColor: Colors.primary,
  },
 });