import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Truck, ChevronRight, AlertTriangle } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import AuthPromptModal from '@/components/AuthPromptModal';
import { FoodTruck } from '@/types';
import { DEBUG } from '@/constants/debug';
import { isTruckVisibilitySetupComplete } from '@/lib/truckVisibilitySetup';

export default function TruckLoginScreen() {
  const router = useRouter();
  const { getOwnedTrucks, setCurrentUser, completeOnboarding, isOwnerLoading, setPendingRedirect, currentUser } = useApp();
  const { isAuthenticated, isLoading: authLoading, user: authUser } = useAuth();
  const { colors } = useTheme();
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);

  const loading = authLoading || isOwnerLoading || (isAuthenticated && !currentUser);
  const ownedTrucks: FoodTruck[] = getOwnedTrucks();
  const isAdmin = currentUser?.role === 'admin';

  useEffect(() => {
    if (loading) return;

    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[TruckLogin] Not authenticated, showing auth modal');
      setPendingRedirect('/truck-login');
      setShowAuthModal(true);
      return;
    }

    if (DEBUG) console.log('[TruckLogin] Authenticated as:', authUser.id, '| Role:', currentUser?.role, '| Owned trucks:', ownedTrucks.length);
  }, [isAuthenticated, authUser, loading, ownedTrucks.length, currentUser?.role]);

  useEffect(() => {
    if (!loading && isAuthenticated && authUser && !isAdmin && ownedTrucks.length === 1) {
      if (DEBUG) console.log('[TruckLogin] Auto-selecting truck:', ownedTrucks[0].id);
      selectTruck(ownedTrucks[0]);
    }
  }, [isAuthenticated, authUser, isAdmin, loading, ownedTrucks.length]);

  const selectTruck = (truck: FoodTruck) => {
    if (!authUser) return;

    setCurrentUser({
      ...(currentUser || {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        favorites: [],
      }),
      role: 'truck',
      truck_id: truck.id,
    });
    completeOnboarding();
    const targetRoute = isTruckVisibilitySetupComplete(truck)
      ? '/(truck)/(tabs)/dashboard'
      : '/(truck)/visibility-wizard';
    if (DEBUG) console.log('[TruckLogin] Navigating for truck:', truck.id, targetRoute);
    router.replace(targetRoute as any);
  };

  const enterAdminTools = () => {
    if (!authUser) return;

    setCurrentUser({
      ...(currentUser || {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        favorites: [],
      }),
      role: 'admin',
      truck_id: undefined,
    });
    completeOnboarding();
    if (DEBUG) console.log('[TruckLogin] Admin entering truck tools without selected truck');
    router.replace('/(truck)/(tabs)/dashboard' as any);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isAuthenticated && authUser && isAdmin && ownedTrucks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.centered]}>
          <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
            <Truck size={48} color={colors.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>Admin Tools</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText, marginBottom: 32 }]}>
            No truck selected. Choose or create a truck to manage.
          </Text>

          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={enterAdminTools}
          >
            <Text style={styles.primaryButtonText}>Enter Admin Tools</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.createButton, { borderColor: colors.primary, backgroundColor: colors.cardBackground }]}
            onPress={() => router.push('/truck-setup' as any)}
          >
            <Text style={[styles.createButtonText, { color: colors.primary }]}>Create a New Truck</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.backLink]}
            onPress={() => router.replace('/(customer)/(tabs)/discover' as any)}
          >
            <Text style={[styles.backLinkText, { color: colors.secondaryText }]}>Go back to browsing</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (isAuthenticated && authUser && ownedTrucks.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, styles.centered]}>
          <View style={[styles.iconContainer, { backgroundColor: `${colors.warning ?? colors.primary}15` }]}>
            <AlertTriangle size={48} color={colors.warning ?? colors.primary} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: colors.text }]}>No Trucks Found</Text>
          <Text style={[styles.subtitle, { color: colors.secondaryText, marginBottom: 32 }]}>
            No trucks are linked to this account yet.
          </Text>

          <TouchableOpacity
            style={[styles.createButton, { borderColor: colors.primary, backgroundColor: colors.cardBackground }]}
            onPress={() => router.push('/truck-setup' as any)}
          >
            <Text style={[styles.createButtonText, { color: colors.primary }]}>Create a New Truck</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.backLink]}
            onPress={() => router.replace('/(customer)/(tabs)/discover' as any)}
          >
            <Text style={[styles.backLinkText, { color: colors.secondaryText }]}>Go back to browsing</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  if (isAuthenticated && authUser && (ownedTrucks.length > 1 || (isAdmin && ownedTrucks.length > 0))) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View style={[styles.iconContainer, { backgroundColor: `${colors.primary}15` }]}>
              <Truck size={48} color={colors.primary} strokeWidth={2} />
            </View>
            <Text style={[styles.title, { color: colors.text }]}>Select Your Truck</Text>
            <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
              Choose which truck to manage
            </Text>
          </View>

          <View style={styles.trucksContainer}>
            {ownedTrucks.map((truck) => (
              <TouchableOpacity
                key={truck.id}
                style={[styles.truckCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                onPress={() => selectTruck(truck)}
              >
                <Image source={{ uri: truck.logo }} style={styles.truckLogo} />
                <View style={styles.truckInfo}>
                  <Text style={[styles.truckName, { color: colors.text }]}>{truck.name}</Text>
                  <Text style={[styles.truckCuisine, { color: colors.secondaryText }]}>
                    {truck.cuisine_type}
                  </Text>
                </View>
                <ChevronRight size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.dividerContainer}>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
            <Text style={[styles.dividerText, { color: colors.secondaryText }]}>OR</Text>
            <View style={[styles.dividerLine, { backgroundColor: colors.border }]} />
          </View>

          <TouchableOpacity
            style={[styles.createButton, { borderColor: colors.primary, backgroundColor: colors.cardBackground }]}
            onPress={() => router.push('/truck-setup' as any)}
          >
            <Text style={[styles.createButtonText, { color: colors.primary }]}>Create a New Truck</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
      <ActivityIndicator size="large" color={colors.primary} />

      <AuthPromptModal
        visible={showAuthModal}
        onClose={() => {
          setShowAuthModal(false);
          router.replace('/(customer)/(tabs)/discover' as any);
        }}
        action="manage a food truck"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  iconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: '700' as const,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  trucksContainer: {
    gap: 12,
    marginBottom: 24,
  },
  truckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  truckLogo: {
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  truckInfo: {
    flex: 1,
  },
  truckName: {
    fontSize: 16,
    fontWeight: '600' as const,
    marginBottom: 2,
  },
  truckCuisine: {
    fontSize: 14,
  },
  dividerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    fontSize: 14,
    fontWeight: '500' as const,
  },
  createButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 24,
  },
  primaryButton: {
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 12,
    width: '100%',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  createButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
  },
  backLink: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  backLinkText: {
    fontSize: 15,
  },
});
