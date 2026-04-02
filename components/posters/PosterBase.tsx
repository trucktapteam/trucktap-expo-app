import React from 'react';
import { View, StyleSheet } from 'react-native';
import { FoodTruck } from '@/types';

interface PosterBaseProps {
  children: React.ReactNode;
}

export interface PosterProps {
  truck: FoodTruck;
  qrDataUrl: string;
}

export type PosterStyle = 'bold' | 'minimal' | 'neon' | 'graffiti';

export const POSTER_STYLES = [
  {
    value: 'bold' as const,
    label: 'Bold Orange',
    description: 'Big headline font, orange accent bars, clean blocks & strong contrast. Great for visibility outdoors.',
  },
  {
    value: 'minimal' as const,
    label: 'Minimal White',
    description: 'Soft gray borders, thin typography, very Apple-style clean layout. Perfect for coffee trucks, bakeries, boutiques.',
  },
  {
    value: 'neon' as const,
    label: 'Neon Glow',
    description: 'Dark background, neon outlines. For late-night trucks, dessert trucks, party vibes.',
  },
  {
    value: 'graffiti' as const,
    label: 'Graffiti Street',
    description: 'Brush fonts & splashes, bright fun colors. Perfect for taco trucks, fusion trucks, street BBQ.',
  },
];

export default function PosterBase({ children }: PosterBaseProps) {
  return (
    <View style={styles.posterContainer}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  posterContainer: {
    width: 540,
    height: 960,
    backgroundColor: '#fff',
  },
});
