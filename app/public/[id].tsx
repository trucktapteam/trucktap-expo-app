import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';

export default function LegacyPublicTruckProfile() {
  const { id, preview } = useLocalSearchParams();
  const router = useRouter();
  const { colors } = useTheme();

  React.useEffect(() => {
    if (typeof id !== 'string' || !id) {
      router.replace('/(customer)/(tabs)/discover' as any);
      return;
    }

    const nextRoute = preview === 'true' ? `/truck/${id}?preview=true` : `/truck/${id}`;
    router.replace(nextRoute as any);
  }, [id, preview, router]);

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
