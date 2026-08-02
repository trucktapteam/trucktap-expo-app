import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { ArchiveRestore, Archive as ArchiveIcon } from 'lucide-react-native';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import { getArchivedPartnerTrucks } from '@/lib/activeTruck';

export default function ArchivedTrucksScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  useTruckLifecycleLogger('ArchivedTrucksScreen');
  const { currentUser, getOwnedTrucks, updateTruckDetails, refreshOwnedTrucks, isOwnerLoading } = useApp();
  const { user: authUser } = useAuth();
  const [restoringTruckId, setRestoringTruckId] = useState<string | null>(null);

  const isPartner = currentUser?.role === 'truck';
  const archivedTrucks = isPartner && authUser
    ? getArchivedPartnerTrucks(getOwnedTrucks(), authUser.id)
    : [];

  // Defensive, matches the Settings row's own gating: this screen is
  // Partner-only, and disappears once there's nothing left to restore --
  // covers both a direct/stale deep link and restoring the last truck here.
  useEffect(() => {
    if (isOwnerLoading) return;
    if (!isPartner || archivedTrucks.length === 0) {
      router.replace('/(truck)/settings' as any);
    }
  }, [isOwnerLoading, isPartner, archivedTrucks.length, router]);

  const handleRestore = async (truckId: string) => {
    if (restoringTruckId) return;

    setRestoringTruckId(truckId);
    try {
      // Same fields as Settings' existing single-truck restore action --
      // reused as-is, no new unarchive logic. Intentionally does not call
      // switchActiveTruck: the existing active-truck resolution effect
      // already re-resolves from eligibleOwnedTrucks once refreshOwnedTrucks
      // completes, keeping the current active truck selected if there is
      // one, or adopting this truck automatically if it was the owner's
      // only truck -- see contexts/AppContext.tsx's activeTruckId effect.
      await updateTruckDetails(truckId, {
        archived: false,
        archivedAt: undefined,
        archiveReason: undefined,
        lastOwnerActivityAt: Date.now(),
      });
      await refreshOwnedTrucks();
    } catch (error: any) {
      console.log('[ArchivedTrucks] Restore truck failed:', error?.message);
      Alert.alert('Could not restore truck', 'Please try again.');
    } finally {
      setRestoringTruckId(null);
    }
  };

  if (isOwnerLoading) {
    return (
      <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.subtitle, { color: colors.secondaryText }]}>
          Archived trucks are hidden from customers. Restore a truck to make it eligible to go LIVE and appear in Switch Truck again.
        </Text>

        {archivedTrucks.map(truck => {
          const restoring = truck.id === restoringTruckId;
          return (
            <View
              key={truck.id}
              style={[styles.truckCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}
            >
              <Image source={{ uri: truck.logo }} style={styles.truckLogo} />
              <View style={styles.truckInfo}>
                <Text style={[styles.truckName, { color: colors.text }]} numberOfLines={1}>{truck.name}</Text>
                <View style={styles.statusRow}>
                  <ArchiveIcon size={14} color={colors.secondaryText} />
                  <Text style={[styles.statusText, { color: colors.secondaryText }]}>Archived</Text>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.restoreButton, { borderColor: colors.primary }, restoring && styles.restoreButtonDisabled]}
                onPress={() => void handleRestore(truck.id)}
                disabled={!!restoringTruckId}
                accessibilityRole="button"
                accessibilityLabel={`Restore ${truck.name}`}
              >
                {restoring ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <>
                    <ArchiveRestore size={16} color={colors.primary} />
                    <Text style={[styles.restoreButtonText, { color: colors.primary }]}>Restore</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.bottomSpacing} />
      </ScrollView>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  truckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
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
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 13,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  restoreButtonDisabled: {
    opacity: 0.6,
  },
  restoreButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
  },
  bottomSpacing: {
    height: 40,
  },
});
