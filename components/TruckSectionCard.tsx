import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Colors from '@/constants/colors';

type TruckSectionCardProps = {
  title?: string;
  children: React.ReactNode;
  style?: ViewStyle;
  noPadding?: boolean;
};

export default function TruckSectionCard({ 
  title, 
  children, 
  style,
  noPadding = false,
}: TruckSectionCardProps) {
  return (
    <View style={[styles.card, style]}>
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      <View style={noPadding ? undefined : styles.cardContent}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.light,
    borderRadius: 16,
    marginBottom: 16,
    shadowColor: Colors.dark,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardContent: {
    padding: 16,
    paddingTop: 0,
  },
});
