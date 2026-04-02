import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import Colors from '@/constants/colors';
import { PosterProps } from './PosterBase';

export default function GraffitiPoster({ truck, qrDataUrl }: PosterProps) {
  return (
    <View style={styles.poster}>
      <View style={styles.splashBackground}>
        <View style={styles.splashCircle1} />
        <View style={styles.splashCircle2} />
        <View style={styles.splashCircle3} />
      </View>

      <View style={styles.content}>
        <View style={styles.heroContainer}>
          <View style={styles.paintSplash} />
          <Image
            source={{ uri: truck.hero_image }}
            style={styles.heroImage}
            contentFit="cover"
          />
        </View>

        {truck.logo ? (
          <View style={styles.logoContainer}>
            <View style={styles.logoPaint} />
            <Image
              source={{ uri: truck.logo }}
              style={styles.logo}
              contentFit="cover"
            />
          </View>
        ) : null}

        <View style={styles.nameBlock}>
          <View style={styles.nameBackground} />
          <Text style={styles.truckName}>{truck.name}</Text>
        </View>
        
        <View style={styles.cuisineTag}>
          <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>
          <View style={styles.underline} />
        </View>

        {truck.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {truck.bio}
          </Text>
        ) : null}

        <View style={styles.qrSection}>
          <Text style={styles.qrLabel}>⚡ SCAN ME! ⚡</Text>
          <View style={styles.qrPaintFrame}>
            <View style={styles.qrFrameTop} />
            <View style={styles.qrFrameBottom} />
            <View style={styles.qrWrapper}>
              <Image
                source={{ uri: qrDataUrl }}
                style={styles.qrImage}
                contentFit="contain"
              />
            </View>
          </View>
          <Text style={styles.qrSubtext}>GET THE FULL MENU</Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.footerPaint} />
          <Text style={styles.footerBrand}>TRUCKTAP</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: 340,
    backgroundColor: '#FFFAE6',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: Colors.dark,
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 0,
    elevation: 8,
    position: 'relative' as const,
  },
  splashBackground: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  splashCircle1: {
    position: 'absolute' as const,
    top: 60,
    right: -40,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#FF6B00',
    opacity: 0.15,
  },
  splashCircle2: {
    position: 'absolute' as const,
    bottom: 100,
    left: -30,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#FFD700',
    opacity: 0.2,
  },
  splashCircle3: {
    position: 'absolute' as const,
    top: '50%',
    right: 30,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    opacity: 0.12,
  },
  content: {
    padding: 20,
    alignItems: 'center',
  },
  heroContainer: {
    width: '100%',
    height: 180,
    borderRadius: 20,
    overflow: 'visible',
    marginBottom: 20,
    position: 'relative' as const,
    transform: [{ rotate: '-1deg' }],
  },
  paintSplash: {
    position: 'absolute' as const,
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    backgroundColor: Colors.primary,
    borderRadius: 24,
    transform: [{ rotate: '2deg' }],
    zIndex: -1,
  },
  heroImage: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
    borderWidth: 4,
    borderColor: Colors.dark,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'visible',
    marginTop: -50,
    marginBottom: 16,
    borderWidth: 4,
    borderColor: Colors.dark,
    backgroundColor: Colors.light,
    position: 'relative' as const,
    transform: [{ rotate: '3deg' }],
  },
  logoPaint: {
    position: 'absolute' as const,
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    backgroundColor: '#FFD700',
    borderRadius: 20,
    transform: [{ rotate: '-4deg' }],
    zIndex: -1,
  },
  logo: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  nameBlock: {
    position: 'relative' as const,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 12,
    transform: [{ rotate: '-1deg' }],
  },
  nameBackground: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    transform: [{ rotate: '1deg' }],
  },
  truckName: {
    fontSize: 28,
    fontWeight: '900' as const,
    color: Colors.light,
    textAlign: 'center',
    letterSpacing: -0.5,
    textTransform: 'uppercase' as const,
    textShadowColor: Colors.dark,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  cuisineTag: {
    paddingHorizontal: 20,
    paddingVertical: 6,
    marginBottom: 16,
    position: 'relative' as const,
  },
  cuisineText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: Colors.dark,
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
  },
  underline: {
    position: 'absolute' as const,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    backgroundColor: '#FFD700',
    transform: [{ rotate: '-1deg' }],
  },
  bio: {
    fontSize: 14,
    color: Colors.dark,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
    fontWeight: '600' as const,
  },
  qrSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  qrLabel: {
    fontSize: 18,
    fontWeight: '900' as const,
    color: Colors.dark,
    marginBottom: 16,
    letterSpacing: 1,
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    transform: [{ rotate: '-2deg' }],
  },
  qrPaintFrame: {
    position: 'relative' as const,
    padding: 20,
  },
  qrFrameTop: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#4CAF50',
    borderRadius: 20,
    transform: [{ rotate: '3deg' }],
  },
  qrFrameBottom: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.primary,
    borderRadius: 20,
    transform: [{ rotate: '-2deg' }],
  },
  qrWrapper: {
    backgroundColor: Colors.light,
    padding: 16,
    borderRadius: 16,
    borderWidth: 4,
    borderColor: Colors.dark,
  },
  qrImage: {
    width: 180,
    height: 180,
  },
  qrSubtext: {
    fontSize: 13,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginTop: 16,
    letterSpacing: 1,
    transform: [{ rotate: '1deg' }],
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
    position: 'relative' as const,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  footerPaint: {
    position: 'absolute' as const,
    top: 0,
    left: '10%',
    right: '10%',
    bottom: 0,
    backgroundColor: Colors.dark,
    borderRadius: 8,
    transform: [{ rotate: '-1deg' }],
  },
  footerBrand: {
    fontSize: 20,
    fontWeight: '900' as const,
    color: '#FFD700',
    letterSpacing: 2,
    textShadowColor: Colors.dark,
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
});
