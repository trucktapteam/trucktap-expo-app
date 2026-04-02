import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { PosterProps } from './PosterBase';

export default function NeonPoster({ truck, qrDataUrl }: PosterProps) {
  return (
    <View style={styles.poster}>
      <View style={styles.content}>
        <View style={styles.heroContainer}>
          <Image
            source={{ uri: truck.hero_image }}
            style={styles.heroImage}
            contentFit="cover"
          />
          <View style={styles.heroOverlay} />
          <View style={styles.neonBorder} />
        </View>

        {truck.logo ? (
          <View style={styles.logoContainer}>
            <View style={styles.logoGlow} />
            <Image
              source={{ uri: truck.logo }}
              style={styles.logo}
              contentFit="cover"
            />
          </View>
        ) : null}

        <View style={styles.nameContainer}>
          <Text style={styles.truckName}>{truck.name}</Text>
          <View style={styles.nameGlow} />
        </View>
        
        <View style={styles.cuisineBadge}>
          <Text style={styles.cuisineText}>{truck.cuisine_type}</Text>
          <View style={styles.cuisineGlow} />
        </View>

        {truck.bio ? (
          <Text style={styles.bio} numberOfLines={3}>
            {truck.bio}
          </Text>
        ) : null}

        <View style={styles.qrSection}>
          <Text style={styles.qrLabel}>⚡ SCAN FOR MENU ⚡</Text>
          <View style={styles.qrContainer}>
            <View style={styles.qrGlow} />
            <View style={styles.qrWrapper}>
              <Image
                source={{ uri: qrDataUrl }}
                style={styles.qrImage}
                contentFit="contain"
              />
            </View>
          </View>
          <Text style={styles.qrSubtext}>Point camera to unlock</Text>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Powered by</Text>
          <Text style={styles.footerBrand}>TRUCKTAP</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  poster: {
    width: 340,
    backgroundColor: '#0A0A0A',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FF3366',
    shadowColor: '#FF3366',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 10,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  heroContainer: {
    width: '100%',
    height: 180,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative' as const,
    marginBottom: 20,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroOverlay: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 51, 102, 0.2)',
  },
  neonBorder: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: '#FF3366',
    borderRadius: 16,
    shadowColor: '#FF3366',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: 'hidden',
    marginTop: -60,
    marginBottom: 16,
    borderWidth: 3,
    borderColor: '#00E5FF',
    backgroundColor: '#0A0A0A',
    position: 'relative' as const,
  },
  logoGlow: {
    position: 'absolute' as const,
    top: -10,
    left: -10,
    right: -10,
    bottom: -10,
    backgroundColor: '#00E5FF',
    opacity: 0.3,
    borderRadius: 50,
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  nameContainer: {
    position: 'relative' as const,
    marginBottom: 12,
  },
  truckName: {
    fontSize: 30,
    fontWeight: '900' as const,
    color: '#FFFFFF',
    textAlign: 'center',
    letterSpacing: 1,
    textShadowColor: '#FF3366',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 15,
  },
  nameGlow: {
    position: 'absolute' as const,
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    backgroundColor: '#FF3366',
    opacity: 0.2,
    borderRadius: 8,
    zIndex: -1,
  },
  cuisineBadge: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#FFB800',
    position: 'relative' as const,
  },
  cuisineGlow: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFB800',
    opacity: 0.2,
    borderRadius: 20,
  },
  cuisineText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: '#FFB800',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    textShadowColor: '#FFB800',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  bio: {
    fontSize: 14,
    color: '#CCCCCC',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 24,
  },
  qrSection: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(255, 51, 102, 0.05)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 51, 102, 0.3)',
    marginTop: 8,
  },
  qrLabel: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#FF3366',
    marginBottom: 16,
    letterSpacing: 2,
    textShadowColor: '#FF3366',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  qrContainer: {
    position: 'relative' as const,
  },
  qrGlow: {
    position: 'absolute' as const,
    top: -15,
    left: -15,
    right: -15,
    bottom: -15,
    backgroundColor: '#00E5FF',
    opacity: 0.2,
    borderRadius: 24,
  },
  qrWrapper: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#00E5FF',
    shadowColor: '#00E5FF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  qrSubtext: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: '#00E5FF',
    marginTop: 12,
    textShadowColor: '#00E5FF',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  footer: {
    marginTop: 24,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 10,
    fontWeight: '600' as const,
    color: '#666',
    letterSpacing: 1,
    marginBottom: 4,
  },
  footerBrand: {
    fontSize: 16,
    fontWeight: '900' as const,
    color: '#FF3366',
    letterSpacing: 1.5,
    textShadowColor: '#FF3366',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
});
