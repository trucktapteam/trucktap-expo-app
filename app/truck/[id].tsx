import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function LegacyTruckProfileRoute() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();

  React.useEffect(() => {
    if (typeof id !== 'string' || !id) {
      router.replace('/(customer)/(tabs)/discover' as any);
      return;
    }

    router.replace(`/public/${id}` as any);
  }, [id, router]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
