import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import { useTheme } from '@/contexts/ThemeContext';
import TruckProfile from '@/components/TruckProfile';

export default function PublicTruckProfile() {
  const { id, preview } = useLocalSearchParams();
  const router = useRouter();
  const isPreview = preview === 'true';
  const { incrementQrScan, foodTrucks } = useApp();
  const { colors } = useTheme();
  
 const hasTrackedScan = React.useRef(false);

React.useEffect(() => {
  if (!id || typeof id !== 'string') return;

  // Wait until trucks are loaded before deciding if the truck exists
  if (!foodTrucks || foodTrucks.length === 0) {
    return;
  }

  const truckExists = foodTrucks.find(t => t.id === id);

  if (!truckExists && !isPreview) {
    console.log('[PublicTruckProfile] Truck not found, redirecting to home');
    setTimeout(() => {
      router.replace('/(customer)/(tabs)/discover' as any);
    }, 0);
    return;
  }

  if (!isPreview && truckExists && !hasTrackedScan.current) {
    hasTrackedScan.current = true;

    const platform =
      Platform.OS === 'ios'
        ? 'iOS'
        : Platform.OS === 'android'
        ? 'Android'
        : 'Web';

    incrementQrScan(id, platform);
  }
}, [id, incrementQrScan, isPreview, router, foodTrucks]); 
  
  return (
    <View style={styles.container}>
      {isPreview && (
        <View style={[styles.previewBanner, { backgroundColor: colors.primary }]}>
          <Text style={[styles.previewBannerText, { color: colors.background }]}>Customer View</Text>
        </View>
      )}
      <TruckProfile truckId={id as string} mode="customer" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  previewBanner: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  previewBannerText: {
    fontSize: 13,
    fontWeight: '600' as const,
    letterSpacing: 0.5,
  },
});
