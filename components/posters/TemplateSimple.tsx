import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import PosterBase from './PosterBase';
import Colors from '@/constants/colors';
import type { PosterTemplateProps } from '@/types/poster';

export default function TemplateSimple({
  truckName,
  cuisine,
  qrImage,
  slogan,
}: PosterTemplateProps) {
  return (
    <PosterBase>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.truckName}>{truckName}</Text>
          <Text style={styles.cuisine}>{cuisine}</Text>
        </View>

        <View style={styles.qrContainer}>
          <Image
            source={{ uri: qrImage }}
            style={styles.qrImage}
            contentFit="contain"
          />
        </View>

        <View style={styles.footer}>
          <Text style={styles.slogan}>{slogan || 'Scan to see our menu!'}</Text>
          <Text style={styles.branding}>Powered by TruckTap</Text>
        </View>
      </View>
    </PosterBase>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.light,
    padding: 40,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    width: '100%',
    paddingTop: 40,
  },
  truckName: {
    fontSize: 48,
    fontWeight: '700' as const,
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 12,
  },
  cuisine: {
    fontSize: 24,
    fontWeight: '500' as const,
    color: Colors.gray,
    textAlign: 'center',
  },
  qrContainer: {
    width: 360,
    height: 360,
    backgroundColor: Colors.light,
    borderRadius: 20,
    padding: 20,
    borderWidth: 4,
    borderColor: Colors.dark,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrImage: {
    width: '100%',
    height: '100%',
  },
  footer: {
    alignItems: 'center',
    width: '100%',
    paddingBottom: 40,
  },
  slogan: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: Colors.dark,
    textAlign: 'center',
    marginBottom: 16,
  },
  branding: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: Colors.gray,
    textAlign: 'center',
  },
});
