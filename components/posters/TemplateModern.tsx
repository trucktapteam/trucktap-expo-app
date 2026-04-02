import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import PosterBase from './PosterBase';
import Colors from '@/constants/colors';
import type { PosterTemplateProps } from '@/types/poster';

export default function TemplateModern({
  truckName,
  cuisine,
  photoUrl,
  qrImage,
  slogan,
  showPhoto = true,
}: PosterTemplateProps) {
  return (
    <PosterBase>
      <View style={styles.container}>
        {showPhoto && photoUrl && (
          <View style={styles.photoContainer}>
            <Image
              source={{ uri: photoUrl }}
              style={styles.photo}
              contentFit="cover"
            />
            <LinearGradient
              colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.7)']}
              style={styles.photoGradient}
            />
          </View>
        )}

        <View style={styles.content}>
          <View style={styles.textContainer}>
            <Text style={styles.truckName}>{truckName}</Text>
            <Text style={styles.cuisine}>{cuisine}</Text>
            <Text style={styles.slogan}>{slogan || 'Scan to see our menu!'}</Text>
          </View>

          <View style={styles.qrCard}>
            <Image
              source={{ uri: qrImage }}
              style={styles.qrImage}
              contentFit="contain"
            />
            <Text style={styles.qrLabel}>Scan Here</Text>
          </View>

          <Text style={styles.branding}>Powered by TruckTap</Text>
        </View>
      </View>
    </PosterBase>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  photoContainer: {
    width: '100%',
    height: 320,
    position: 'relative',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  content: {
    flex: 1,
    padding: 40,
    justifyContent: 'space-between',
  },
  textContainer: {
    marginTop: 20,
  },
  truckName: {
    fontSize: 44,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  cuisine: {
    fontSize: 20,
    fontWeight: '500' as const,
    color: Colors.primary,
    marginBottom: 16,
  },
  slogan: {
    fontSize: 18,
    fontWeight: '400' as const,
    color: Colors.gray,
    lineHeight: 26,
  },
  qrCard: {
    backgroundColor: Colors.light,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 10,
  },
  qrImage: {
    width: 280,
    height: 280,
    marginBottom: 16,
  },
  qrLabel: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  branding: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.gray,
    textAlign: 'center',
    marginTop: 20,
  },
});
