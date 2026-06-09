import React, { useEffect, useMemo } from 'react';
import { ActivityIndicator, Alert, View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { ChevronRight, Eye, EyeOff, Mail, RotateCcw, Truck } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { FoodTruck } from '@/types';

export default function AdminTruckPickerScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const { isLoading: authLoading } = useAuth();
  const {
    currentUser,
    foodTrucks,
    setSelectedAdminTruckId,
    completeOnboarding,
    getTruckActivitySummary,
    isTruckInactive,
    updateTruckDetails,
  } = useApp();
  const isAdmin = currentUser?.role === 'admin';

  const trucks = useMemo(
    () =>
      [...foodTrucks].sort((a, b) =>
        (a.name || 'Unnamed truck').localeCompare(b.name || 'Unnamed truck')
      ),
    [foodTrucks]
  );
  const publicTrucks = useMemo(
    () => trucks.filter(truck => truck.archived !== true && !truck.archivedAt && truck.is_test !== true),
    [trucks]
  );
  const inactiveTrucks = useMemo(
    () => publicTrucks.filter(truck => isTruckInactive(truck.id)),
    [publicTrucks, isTruckInactive]
  );
  const activeTruckCount = publicTrucks.length - inactiveTrucks.length;

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

  const formatLastLiveDate = (iso?: string) => {
    if (!iso) return 'Never';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return 'Unknown';

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatDaysSinceActivity = (days: number | null) =>
    days === null ? 'No activity' : `${days} day${days === 1 ? '' : 's'} ago`;

  const reactivateTruck = async (truck: FoodTruck) => {
    try {
      await updateTruckDetails(truck.id, { lastOwnerActivityAt: Date.now() });
      Alert.alert('Truck reactivated', `${truck.name || 'This truck'} is visible to customers again.`);
    } catch (error: any) {
      Alert.alert('Reactivate failed', error?.message ?? 'Could not reactivate this truck.');
    }
  };

  const hideTruck = (truck: FoodTruck) => {
    Alert.alert(
      'Already hidden',
      `${truck.name || 'This truck'} is inactive and already hidden from customer discovery.`
    );
  };

  const contactOwner = (truck: FoodTruck) => {
    Alert.alert(
      'Contact Owner',
      `Owner ID: ${truck.owner_id || 'Unknown'}`
    );
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

        <View style={styles.statsRow}>
          <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{activeTruckCount}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Active Trucks</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.text }]}>{inactiveTrucks.length}</Text>
            <Text style={[styles.statLabel, { color: colors.secondaryText }]}>Inactive Trucks</Text>
          </View>
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
                  {(truck.archived === true || !!truck.archivedAt) && (
                    <Text style={[styles.archivedText, { color: colors.error }]}>Archived</Text>
                  )}
                </View>
                <ChevronRight size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        {inactiveTrucks.length > 0 && (
          <View style={styles.inactiveSection}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Inactive Trucks</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.secondaryText }]}>
                Hidden from customer discovery until activity resumes.
              </Text>
            </View>

            <View style={styles.inactiveList}>
              {inactiveTrucks.map((truck) => {
                const activity = getTruckActivitySummary(truck.id);

                return (
                  <View
                    key={`inactive-${truck.id}`}
                    style={[styles.inactiveCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
                  >
                    <View style={styles.inactiveCardHeader}>
                      <View style={styles.inactiveTitleWrap}>
                        <Text style={[styles.truckName, { color: colors.text }]} numberOfLines={1}>
                          {truck.name || 'Unnamed truck'}
                        </Text>
                        <Text style={[styles.truckMeta, { color: colors.secondaryText }]} numberOfLines={1}>
                          Owner: {truck.owner_id || 'Unknown'}
                        </Text>
                      </View>
                      <Text style={[styles.inactiveBadge, { color: colors.secondaryText, backgroundColor: colors.secondaryBackground }]}>
                        Inactive
                      </Text>
                    </View>

                    <View style={styles.activityGrid}>
                      <Text style={[styles.activityText, { color: colors.secondaryText }]}>
                        Last LIVE: {formatLastLiveDate(activity.lastLiveAt)}
                      </Text>
                      <Text style={[styles.activityText, { color: colors.secondaryText }]}>
                        Upcoming Stops: {activity.upcomingStopCount}
                      </Text>
                      <Text style={[styles.activityText, { color: colors.secondaryText }]}>
                        Announcements: {activity.announcementCount}
                      </Text>
                      <Text style={[styles.activityText, { color: colors.secondaryText }]}>
                        Activity: {formatDaysSinceActivity(activity.daysSinceActivity)}
                      </Text>
                    </View>

                    <View style={styles.actionRow}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => selectTruck(truck)} activeOpacity={0.7}>
                        <Eye size={14} color={colors.primary} />
                        <Text style={[styles.actionText, { color: colors.primary }]}>View Truck</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => reactivateTruck(truck)} activeOpacity={0.7}>
                        <RotateCcw size={14} color={colors.primary} />
                        <Text style={[styles.actionText, { color: colors.primary }]}>Reactivate</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => hideTruck(truck)} activeOpacity={0.7}>
                        <EyeOff size={14} color={colors.secondaryText} />
                        <Text style={[styles.actionText, { color: colors.secondaryText }]}>Hide</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => contactOwner(truck)} activeOpacity={0.7}>
                        <Mail size={14} color={colors.secondaryText} />
                        <Text style={[styles.actionText, { color: colors.secondaryText }]}>Contact Owner</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })}
            </View>
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
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800' as const,
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 13,
    fontWeight: '600' as const,
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
  archivedText: {
    fontSize: 12,
    fontWeight: '700' as const,
    marginTop: 3,
    textTransform: 'uppercase',
  },
  inactiveSection: {
    marginBottom: 24,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '800' as const,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  inactiveList: {
    gap: 12,
  },
  inactiveCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
  },
  inactiveCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  inactiveTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  inactiveBadge: {
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: '800' as const,
    textTransform: 'uppercase',
  },
  activityGrid: {
    gap: 5,
    marginBottom: 12,
  },
  activityText: {
    fontSize: 12,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 9,
    borderRadius: 8,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700' as const,
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
