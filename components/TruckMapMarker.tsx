import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

type TruckMapMarkerProps = {
  isOpen?: boolean;
};

export default function TruckMapMarker({ isOpen = false }: TruckMapMarkerProps) {
  if (Platform.OS === 'android') {
  return (
    <View
      style={{
        width: 12,
        height: 12,
        borderRadius: 6,
        backgroundColor: '#f97316',
      }}
    />
  );
}

  return (
    <View style={[styles.markerContainer, isOpen && styles.markerContainerOpen]}>
      <View style={styles.markerDot} />
    </View>
  );
 }

 const styles = StyleSheet.create({
  androidMarker: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  androidMarkerOpen: {
    backgroundColor: '#f97316',
  },
  androidMarkerText: {
    color: '#f97316',
    fontSize: 1,
    lineHeight: 1,
  },
  markerContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    borderWidth: 3,
    borderColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerContainerOpen: {
    borderColor: '#f97316',
  },
  markerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#f97316',
  },
 });