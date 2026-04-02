import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import PosterBase from './PosterBase';
import Colors from '@/constants/colors';
import type { PosterTemplateProps } from '@/types/poster';

export default function TemplateBold({
  truckName,
  cuisine,
  qrImage,
  slogan,
  backgroundColor,
}: PosterTemplateProps) {
  const bgColor = backgroundColor || Colors.primary;

  return (
    <PosterBase>
      <LinearGradient
        colors={[bgColor, darkenColor(bgColor, 0.3)]}
        style={styles.container}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      >
        <View style={styles.header}>
          <Text style={styles.truckName}>{truckName}</Text>
          <View style={styles.divider} />
          <Text style={styles.cuisine}>{cuisine}</Text>
        </View>

        <View style={styles.qrContainer}>
          <View style={styles.qrGlow}>
            <View style={styles.qrCard}>
              <Image
                source={{ uri: qrImage }}
                style={styles.qrImage}
                contentFit="contain"
              />
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.slogan}>{slogan || 'Scan to see our menu!'}</Text>
          <Text style={styles.branding}>Powered by TruckTap</Text>
        </View>
      </LinearGradient>
    </PosterBase>
  );
}

function darkenColor(color: string, amount: number): string {
  const hex = color.replace('#', '');
  const r = Math.max(0, parseInt(hex.substring(0, 2), 16) * (1 - amount));
  const g = Math.max(0, parseInt(hex.substring(2, 4), 16) * (1 - amount));
  const b = Math.max(0, parseInt(hex.substring(4, 6), 16) * (1 - amount));
  return `#${Math.floor(r).toString(16).padStart(2, '0')}${Math.floor(g).toString(16).padStart(2, '0')}${Math.floor(b).toString(16).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 40,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    paddingTop: 60,
  },
  truckName: {
    fontSize: 56,
    fontWeight: '900' as const,
    color: Colors.light,
    textAlign: 'center',
    textTransform: 'uppercase',
    letterSpacing: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 8,
  },
  divider: {
    width: 120,
    height: 4,
    backgroundColor: Colors.light,
    borderRadius: 2,
    marginVertical: 20,
  },
  cuisine: {
    fontSize: 24,
    fontWeight: '600' as const,
    color: Colors.light,
    textAlign: 'center',
    opacity: 0.9,
  },
  qrContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrGlow: {
    padding: 20,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    shadowColor: Colors.light,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 30,
    elevation: 20,
  },
  qrCard: {
    backgroundColor: Colors.light,
    borderRadius: 32,
    padding: 32,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  qrImage: {
    width: 300,
    height: 300,
  },
  footer: {
    alignItems: 'center',
    paddingBottom: 40,
  },
  slogan: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.light,
    textAlign: 'center',
    marginBottom: 20,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  branding: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.light,
    textAlign: 'center',
    opacity: 0.8,
  },
});
