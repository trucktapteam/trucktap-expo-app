import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { ChevronRight, Truck } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FoodTruck } from '@/types';

export default function AdminTruckPickerScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const { currentUser, foodTrucks, setSelectedAdminTruckId, completeOnboarding } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const trucks = useMemo(
    () =>
      [...foodTrucks].sort((a, b) =>
        (a.name || 'Unnamed truck').localeCompare(b.name || 'Unnamed truck')
      ),
    [foodTrucks]
  );

  useEffect(() => {
    if (authLoading || !currentUser) return;
    if (!isAdmin) {
      const targetRoute = '/truck-login';
      if (__DEV__) console.log('[AdminTruckPicker] Non-admin access blocked:', { targetRoute });
      router.replace(targetRoute as any);
    }
  }, [authLoading, currentUser, isAdmin, router]);

  const selectTruck = (truck: FoodTruck) => {
    const targetRoute = '/(truck)/(tabs)/dashboard';
    if (__DEV__) {
      console.log('[AdminTruckPicker] Truck selected:', {
        truckId: truck.id,
        truckName: truck.name,
        targetRoute,
      });
    }

    setSelectedAdminTruckId(truck.id);
    completeOnboarding();
    router.replace(targetRoute as any);
  };

  const createTruck = () => {
    const targetRoute = '/truck-setup';
    if (__DEV__) {
      console.log('[AdminTruckPicker] Create a Truck pressed:', { currentPathname: pathname, targetRoute });
      Alert.alert('Debug navigation', `Navigating to ${targetRoute}`);
    }

    try {
      router.push(targetRoute as any);
    } catch (error) {
      console.log('[AdminTruckPicker] Create a Truck navigation failed:', {
        currentPathname: pathname,
        targetRoute,
        error,
      });
    }
  };

  if (authLoading || !currentUser || !isAdmin) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
            <Truck size={36} color={colors.primary} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Choose a Truck</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
            Select a real truck to manage as an admin.
          </Text>
        </View>

        {trucks.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.emptyTitle, { color: colors.text }]}>No trucks found</Text>
            <Text style={[styles.emptyText, { color: colors.secondaryText }]}>
              Create a truck to start managing it.
            </Text>
          </View>
        ) : (
          <View style={styles.truckList}>
            {trucks.map((truck) => (
              <TouchableOpacity
                key={truck.id}
                style={[styles.truckCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => selectTruck(truck)}
                activeOpacity={0.7}
              >
                <Image source={truck.logo ? { uri: truck.logo } : undefined} style={styles.logo} />
                <View style={styles.truckInfo}>
                  <Text style={[styles.truckName, { color: colors.text }]} numberOfLines={1}>
                    {truck.name || 'Unnamed truck'}
                  </Text>
                  <Text style={[styles.truckMeta, { color: colors.secondaryText }]} numberOfLines={1}>
                    {truck.cuisine_type || 'Food truck'}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.createButton, { borderColor: colors.primary, backgroundColor: colors.cardBackground }]}
          onPress={createTruck}
          activeOpacity={0.7}
        >
          <Text style={[styles.createButtonText, { color: colors.primary }]}>Create a Truck</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
  },
  iconContainer: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  truckList: {
    gap: 12,
    marginBottom: 24,
  },
  truckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  logo: {
    width: 48,
    height: 48,
    borderRadius: 12,
  },
  truckInfo: {
    flex: 1,
  },
  truckName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 3,
  },
  truckMeta: {
    fontSize: 14,
  },
  emptyCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
  createButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
});
