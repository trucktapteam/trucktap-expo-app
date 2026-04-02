import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Colors from '@/constants/colors';
import { PosterProps } from './PosterBase';

export default function MinimalPoster({ truck, qrDataUrl }: PosterProps) {
  return (
    <View style={styles.poster}>
      <View style={styles.content}>
        <View style={styles.topBorder} />
        
        {truck.logo ? (
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: truck.logo }}
              style={styles.logo}
              contentFit="cover"
            />
          </View>
        ) : null}

        <Text style={styles.truckName}>{truck.name}</Text>
        
        <View style={styles.divider} />
        
        <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>

        {truck.bio ? (
          <Text style={styles.bio} numberOfLines={4}>
            {truck.bio}
          </Text>
        ) : null}

        <View style={styles.heroContainer}>
          <Image
            source={{ uri: truck.hero_image }}
            style={styles.heroImage}
            contentFit="cover"
          />
        </View>

        <View style={styles.qrSection}>
          <Text style={styles.qrLabel}>Scan to visit</Text>
          <View style={styles.qrWrapper}>
            <Image
              source={{ uri: qrDataUrl }}
              style={styles.qrImage}
              contentFit="contain"
            />
          </View>
          <Text style={styles.qrSubtext}>Use your camera app</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by TruckTap</Text>
        </View>
        
        <View style={styles.bottomBorder} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: 340,
    backgroundColor: Colors.light,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  content: {
    padding: 32,
    alignItems: 'center',
  },
  topBorder: {
    width: '100%',
    height: 1,
    backgroundColor: '#E0E0E0',
    marginBottom: 24,
  },
  logoContainer: {
    width: 70,
    height: 70,
    borderRadius: 35,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: Colors.lightGray,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  truckName: {
    fontSize: 26,
    fontWeight: '300' as const,
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: 2,
  },
  divider: {
    width: 40,
    height: 1,
    backgroundColor: '#D0D0D0',
    marginVertical: 16,
  },
  cuisineText: {
    fontSize: 12,
    fontWeight: '400' as const,
    color: Colors.gray,
    textTransform: 'uppercase' as const,
    letterSpacing: 2,
    marginBottom: 16,
  },
  bio: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
    fontWeight: '300' as const,
  },
  heroContainer: {
    width: '100%',
    height: 160,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  qrSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 24,
  },
  qrLabel: {
    fontSize: 12,
    fontWeight: '300' as const,
    color: Colors.gray,
    marginBottom: 16,
    letterSpacing: 1,
  },
  qrWrapper: {
    backgroundColor: Colors.light,
    padding: 12,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrSubtext: {
    fontSize: 11,
    fontWeight: '300' as const,
    color: '#999',
    marginTop: 12,
  },
  footer: {
    marginTop: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '300' as const,
    color: '#999',
    letterSpacing: 1,
  },
  bottomBorder: {
    width: '100%',
    height: 1,
    backgroundColor: '#E0E0E0',
  },
});
