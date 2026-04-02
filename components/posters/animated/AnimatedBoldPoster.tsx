import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import Colors from '@/constants/colors';
import { AnimatedPosterProps, useQRPulse, useFadeInSlide, useWiggle } from './AnimatedPosterBase';

export default function AnimatedBoldPoster({ truck, qrDataUrl, isPlaying = true }: AnimatedPosterProps) {
  const qrPulseStyle = useQRPulse(isPlaying);
  const nameFadeStyle = useFadeInSlide(isPlaying, 200);
  const scanMeWiggleStyle = useWiggle(isPlaying, 1500);

  return (
    <View style={styles.poster}>
      <View style={styles.orangeBar} />
      
      <View style={styles.heroContainer}>
        <Image
          source={{ uri: truck.hero_image }}
          style={styles.heroImage}
          contentFit="cover"
        />
      </View>

      <View style={styles.content}>
        {truck.logo ? (
          <View style={styles.logoContainer}>
            <Image
              source={{ uri: truck.logo }}
              style={styles.logo}
              contentFit="cover"
            />
          </View>
        ) : null}

        <Animated.View style={nameFadeStyle}>
          <Text style={styles.truckName}>{truck.name}</Text>
        </Animated.View>
        
        <View style={styles.cuisineBadge}>
          <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>
        </View>

        {truck.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {truck.bio}
          </Text>
        ) : null}

        <View style={styles.qrSection}>
          <View style={styles.orangeAccentBar} />
          <Animated.View style={scanMeWiggleStyle}>
            <Text style={styles.qrLabel}>SCAN TO VIEW MENU</Text>
          </Animated.View>
          <Animated.View style={[styles.qrWrapper, qrPulseStyle]}>
            <Image
              source={{ uri: qrDataUrl }}
              style={styles.qrImage}
              contentFit="contain"
            />
          </Animated.View>
          <Text style={styles.qrSubtext}>Open camera & scan QR code</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.orangeAccentBar} />
          <Text style={styles.footerText}>POWERED BY</Text>
          <Text style={styles.footerBrand}>TRUCKTAP</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: 340,
    backgroundColor: Colors.light,
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 8,
  },
  orangeBar: {
    width: '100%',
    height: 16,
    backgroundColor: Colors.primary,
  },
  heroContainer: {
    width: '100%',
    height: 180,
    backgroundColor: Colors.lightGray,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: -60,
    marginBottom: 16,
    borderWidth: 5,
    borderColor: Colors.primary,
    backgroundColor: Colors.light,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  truckName: {
    fontSize: 32,
    fontWeight: '900' as const,
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: -0.5,
    textTransform: 'uppercase' as const,
  },
  cuisineBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginBottom: 16,
  },
  cuisineText: {
    fontSize: 15,
    fontWeight: '800' as const,
    color: Colors.light,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
  },
  bio: {
    fontSize: 15,
    color: Colors.gray,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 20,
    fontWeight: '500' as const,
  },
  qrSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: Colors.lightGray,
    borderRadius: 16,
    marginTop: 8,
  },
  orangeAccentBar: {
    width: 60,
    height: 4,
    backgroundColor: Colors.primary,
    marginBottom: 12,
  },
  qrLabel: {
    fontSize: 17,
    fontWeight: '900' as const,
    color: Colors.dark,
    marginBottom: 16,
    letterSpacing: 1,
  },
  qrWrapper: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: Colors.primary,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrSubtext: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.gray,
    marginTop: 12,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: Colors.gray,
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerBrand: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: Colors.primary,
    letterSpacing: 1,
  },
});
