import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { Heart, MapPin, Star, ChevronRight, User, Edit2, Settings, Truck } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import AuthPromptModal from '@/components/AuthPromptModal';

export default function ProfileScreen() {
  const { currentUser, foodTrucks, getAverageRating } = useApp();
  console.log('[ProfileScreen] currentUser:', currentUser);
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const router = useRouter();
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authAction, setAuthAction] = useState<string>('');

  const styles = createStyles(colors);

  const favoriteTrucks = foodTrucks.filter(truck => 
    currentUser?.favorites?.includes(truck.id)
  );

  const handleEditProfile = () => {
    if (!isAuthenticated) {
      setAuthAction('edit your profile');
      setShowAuthModal(true);
      return;
    }
    router.push('/(customer)/edit-profile' as any);
  };

  const handleSignIn = () => {
  router.push('/customer-login' as any);
};

const handleCreateAccount = () => {
  router.push('/customer-login' as any);
};

  const handleTrucksEnterHere = () => {
    if (currentUser?.role === 'truck' && currentUser?.truck_id) {
      router.push('/(truck)/(tabs)/dashboard' as any);
    } else {
      router.push('/truck-login' as any);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerButtons}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity onPress={() => router.push('/(customer)/settings' as any)} style={styles.headerButton}>
          <Settings size={24} color={colors.text} />
        </TouchableOpacity>
        {isAuthenticated ? (
  <TouchableOpacity onPress={handleEditProfile} style={styles.headerButton}>
    <Edit2 size={24} color={colors.text} />
  </TouchableOpacity>
) : null}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {isAuthenticated ? (
  <View style={styles.profileCard}>
    <View style={styles.avatarContainer}>
      {currentUser?.profile_photo ? (
        <Image
          key={currentUser.profile_photo}
          source={{
            uri: `${currentUser.profile_photo}${currentUser.profile_photo.includes('?') ? '&' : '?'}cb=${Date.now()}`
          }}
          style={styles.profileImage}
        />
      ) : (
        <View style={styles.avatar}>
          <User size={40} color={colors.primary} />
        </View>
      )}
    </View>
    <Text style={styles.userName}>{currentUser?.name || 'Food Lover'}</Text>
    <Text style={styles.userEmail}>{currentUser?.email}</Text>

    <View style={styles.statsContainer}>
      <View style={styles.statItem}>
        <Heart size={20} color={colors.primary} />
        <Text style={styles.statValue}>{favoriteTrucks.length}</Text>
        <Text style={styles.statLabel}>Favorites</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <MapPin size={20} color={colors.primary} />
        <Text style={styles.statValue}>{foodTrucks.filter(t => !t.archived).length}</Text>
        <Text style={styles.statLabel}>Trucks Nearby</Text>
      </View>
    </View>
  </View>
) : (
  <View style={styles.profileCard}>
    <View style={styles.avatar}>
      <User size={40} color={colors.primary} />
    </View>

    <Text style={styles.userName}>Welcome to TruckTap</Text>
    <Text style={styles.guestText}>
      Sign in to save favorites, leave reviews, and personalize your experience.
    </Text>

    <TouchableOpacity style={styles.signInButton} onPress={handleSignIn}>
      <Text style={styles.signInButtonText}>Sign In</Text>
    </TouchableOpacity>

    <TouchableOpacity onPress={handleCreateAccount}>
      <Text style={styles.createAccountText}>Create Account</Text>
    </TouchableOpacity>

    <View style={styles.statsContainer}>
      <View style={styles.statItem}>
        <Heart size={20} color={colors.primary} />
        <Text style={styles.statValue}>0</Text>
        <Text style={styles.statLabel}>Favorites</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <MapPin size={20} color={colors.primary} />
        <Text style={styles.statValue}>{foodTrucks.filter(t => !t.archived).length}</Text>
        <Text style={styles.statLabel}>Trucks Nearby</Text>
      </View>
    </View>
  </View>
)}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => router.push('/(customer)/(tabs)/favorites' as any)}
          >
            <View style={styles.actionIconContainer}>
              <Heart size={22} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>My Favorites</Text>
              <Text style={styles.actionSubtitle}>
                {favoriteTrucks.length} {favoriteTrucks.length === 1 ? 'truck' : 'trucks'} saved
              </Text>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={() => router.push('/(customer)/(tabs)/discover' as any)}
          >
            <View style={styles.actionIconContainer}>
              <MapPin size={22} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>Discover Trucks</Text>
              <Text style={styles.actionSubtitle}>Find food trucks near you</Text>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleTrucksEnterHere}
          >
            <View style={styles.actionIconContainer}>
              <Truck size={22} color={colors.primary} />
            </View>
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>🚚 Trucks Enter Here</Text>
              <Text style={styles.actionSubtitle}>Access truck owner dashboard</Text>
            </View>
            <ChevronRight size={20} color={colors.secondaryText} />
          </TouchableOpacity>
        </View>

        {favoriteTrucks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recent Favorites</Text>
            {favoriteTrucks.slice(0, 3).map((truck) => (
              <TouchableOpacity
                key={truck.id}
                style={styles.truckCard}
                onPress={() => router.push(`/truck/${truck.id}` as any)}
              >
                <View style={styles.truckInfo}>
                  <Text style={styles.truckName}>{truck.name}</Text>
                  <View style={styles.truckMeta}>
                    <Star size={14} color={colors.primary} fill={colors.primary} />
                    <Text style={styles.truckRating}>{getAverageRating(truck.id).average.toFixed(1)}</Text>
                    <Text style={styles.truckCuisine}> • {truck.cuisine_type}</Text>
                  </View>
                </View>
                <ChevronRight size={20} color={colors.secondaryText} />
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={styles.bottomSpacing} />
      </ScrollView>

      <AuthPromptModal
        visible={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        action={authAction}
        returnRoute="/(customer)/(tabs)/profile"
      />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  headerButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
  },
  profileCard: {
    backgroundColor: colors.cardBackground,
    marginHorizontal: 20,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  guestText: {
  fontSize: 15,
  color: colors.secondaryText,
  textAlign: 'center',
  marginBottom: 20,
  lineHeight: 22,
},

signInButton: {
  backgroundColor: colors.primary,
  paddingHorizontal: 24,
  paddingVertical: 12,
  borderRadius: 12,
  marginBottom: 12,
  minWidth: 160,
  alignItems: 'center',
},

signInButtonText: {
  color: '#fff',
  fontSize: 16,
  fontWeight: '700' as const,
},

createAccountText: {
  fontSize: 15,
  fontWeight: '600' as const,
  color: colors.primary,
  marginBottom: 20,
},
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 15,
    color: colors.secondaryText,
    marginBottom: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    width: '100%',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: colors.border,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: colors.text,
  },
  statLabel: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
  },
  actionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  actionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${colors.primary}15`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  truckCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  truckInfo: {
    flex: 1,
  },
  truckName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 4,
  },
  truckMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  truckRating: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
    marginLeft: 4,
  },
  truckCuisine: {
    fontSize: 14,
    color: colors.secondaryText,
  },
  bottomSpacing: {
    height: 40,
  },
});
