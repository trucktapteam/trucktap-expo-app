import React from 'react';
import { Platform } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useApp } from '@/contexts/AppContext';
import TruckProfile from '@/components/TruckProfile';

export default function TruckProfileScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { incrementQrScan, currentUser, setPendingRedirect, foodTrucks } = useApp();
  
  React.useEffect(() => {
    if (!currentUser && id && typeof id === 'string') {
      const truckExists = foodTrucks.find(t => t.id === id);
      if (truckExists) {
        console.log('[TruckProfile] User not logged in, storing redirect and navigating to login');
        setPendingRedirect(`/truck/${id}`);
        router.replace('/customer-login' as any);
      } else {
        console.log('[TruckProfile] Truck not found, redirecting to home');
        router.replace('/(customer)/(tabs)/discover' as any);
      }
      return;
    }

    if (id && typeof id === 'string') {
      const platform = Platform.OS === 'ios' ? 'iOS' : 
                      Platform.OS === 'android' ? 'Android' : 
                      'Web';
      incrementQrScan(id, platform);
    }
  }, [id, incrementQrScan, currentUser, setPendingRedirect, router, foodTrucks]);
  
  return <TruckProfile truckId={id as string} mode="owner" />;
}
