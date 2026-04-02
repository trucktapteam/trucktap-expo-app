import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Heart } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useFavoriteTrucks, useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Image } from 'expo-image';

import AuthPromptModal from '@/components/AuthPromptModal';

export default function FavoritesScreen() {
  const router = useRouter();
  const { isTruckOpenNow } = useApp();
  const { colors } = useTheme();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const favoriteTrucks = useFavoriteTrucks();
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);

  const styles = createStyles(colors);

  const handleTruckPress = (truckId: string) => {
    router.push(`/(customer)/truck/${truckId}` as any);
  };

  if (authLoading) {
    return (
      <View style={styles.container}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyContainer}>
          <Heart size={64} color={colors.secondaryText} strokeWidth={1.5} />
          <Text style={styles.emptyTitle}>Save Your Favorite Trucks</Text>
          <Text style={styles.emptySubtitle}>
            Sign in to favorite trucks and keep track of the ones you love.
          </Text>
          <TouchableOpacity
            style={styles.signInButton}
            onPress={() => setShowAuthPrompt(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.signInButtonText}>Sign In</Text>
          </TouchableOpacity>
        </View>

        <AuthPromptModal
          visible={showAuthPrompt}
          onClose={() => setShowAuthPrompt(false)}
          action="save favorites"
          returnRoute="/(customer)/(tabs)/favorites"
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {favoriteTrucks.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Heart size={64} color={colors.secondaryText} />
          <Text style={styles.emptyTitle}>No favorites yet</Text>
          <Text style={styles.emptyText}>
            Tap the heart icon on any truck to save it here
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
          <View style={styles.grid}>
            {favoriteTrucks.map(truck => (
              <TouchableOpacity
                key={truck.id}
                style={styles.truckCard}
                onPress={() => handleTruckPress(truck.id)}
              >
                <Image source={{ uri: truck.hero_image }} style={styles.truckImage} />
                <View style={styles.truckOverlay}>
                  <Image source={{ uri: truck.logo }} style={styles.truckLogo} />
                </View>
                <View style={styles.truckInfo}>
                  <Text style={styles.truckName} numberOfLines={1}>{truck.name}</Text>
                  <Text style={styles.truckCuisine}>{truck.cuisine_type}</Text>
                  <View style={[styles.statusBadge, isTruckOpenNow(truck.id) && styles.statusBadgeOpen]}>
                    <Text style={[styles.statusText, isTruckOpenNow(truck.id) && styles.statusTextOpen]}>
                      {isTruckOpenNow(truck.id) ? 'Open' : 'Closed'}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 16,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 40,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 15,
    color: colors.secondaryText,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  signInButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  signInButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.background,
  },
  list: {
    flex: 1,
  },
  grid: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 20,
    gap: 16,
  },
  truckCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  truckImage: {
    width: '100%',
    height: 160,
    backgroundColor: colors.secondaryBackground,
  },
  truckOverlay: {
    position: 'absolute',
    top: 120,
    left: 16,
  },
  truckLogo: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: colors.background,
    backgroundColor: colors.cardBackground,
  },
  truckInfo: {
    padding: 16,
    paddingTop: 24,
  },
  truckName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 4,
  },
  truckCuisine: {
    fontSize: 14,
    color: colors.secondaryText,
    marginBottom: 8,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.secondaryBackground,
  },
  statusBadgeOpen: {
    backgroundColor: `${colors.success}20`,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.secondaryText,
  },
  statusTextOpen: {
    color: colors.success,
  },
});
