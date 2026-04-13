import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import TruckProfile from '@/components/TruckProfile';

export default function TruckDetailScreen() {
  const { id } = useLocalSearchParams();

  return <TruckProfile truckId={id as string} mode="customer" />;
}
