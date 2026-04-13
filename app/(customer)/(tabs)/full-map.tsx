import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert, Animated, PanResponder, Dimensions, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { Target, ChevronRight, Heart, Star, Navigation, Eye, EyeOff } from 'lucide-react-native';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/contexts/ThemeContext';
import { useFilteredTrucks, useApp, useTruckRating } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import AuthPromptModal from '@/components/AuthPromptModal';
import { Image } from 'expo-image';
import { FoodTruck, Sighting } from '@/types';
import { supabase } from '@/lib/supabase';
import { formatSightingLastSeen, hasSightingCoordinates } from '@/lib/sightings';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.45;
const SNAP_THRESHOLD = 50;

const hasMapLocation = (truck: FoodTruck) =>
  Number.isFinite(truck.location?.latitude) &&
  Number.isFinite(truck.location?.longitude);

export default function FullMapScreen() {
  const router = useRouter();
  const { currentUser, toggleFavorite, isTruckOpenNow, showClosed, setShowClosed } = useApp();
  const { colors } = useTheme();
  const { isAuthenticated } = useAuth();
  const mapRef = useRef<MapView>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [selectedTruck, setSelectedTruck] = useState<FoodTruck | null>(null);
  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const sheetY = useRef(new Animated.Value(SHEET_MAX_HEIGHT)).current;
  const markerScales = useRef<{ [key: string]: Animated.Value }>({}).current;

  const allTrucks = useFilteredTrucks('', 'All', false);
  const trucksWithLocation = useMemo(
    () => allTrucks.filter(hasMapLocation),
    [allTrucks]
  );
  const openTrucks = trucksWithLocation.filter(truck => isTruckOpenNow(truck.id));
  const trucksForMap = showClosed ? trucksWithLocation : openTrucks;

  const fetchSightings = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sightings')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      setSightings((data ?? []).filter(hasSightingCoordinates));
    } catch (error) {
      console.error('[FullMapScreen] Failed to load sightings:', error);
    }
  }, []);

  trucksWithLocation.forEach(truck => {
    if (!markerScales[truck.id]) {
      markerScales[truck.id] = new Animated.Value(1);
    }
  });

  const mapRegion = useMemo(() => ({
    latitude: 37.7181,
    longitude: -85.9011,
    latitudeDelta: 0.15,
    longitudeDelta: 0.15,
  }), []);

  const openSheet = useCallback(() => {
    Animated.spring(sheetY, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [sheetY]);

  const closeSheet = useCallback(() => {
    Animated.timing(sheetY, {
      toValue: SHEET_MAX_HEIGHT,
      duration: 250,
      useNativeDriver: true,
    }).start(() => {
      setSelectedTruck(null);
      setSelectedSighting(null);
    });
  }, [sheetY]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 5;
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          sheetY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SNAP_THRESHOLD || gestureState.vy > 0.5) {
          closeSheet();
        } else {
          openSheet();
        }
      },
    })
  ).current;

  const animateMarker = (truckId: string, toValue: number) => {
    Animated.spring(markerScales[truckId], {
      toValue,
      useNativeDriver: true,
      tension: 100,
      friction: 7,
    }).start();
  };

  const handleTruckPress = (truckId: string) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    const truck = trucksWithLocation.find(t => t.id === truckId);
    if (truck) {
      setSelectedSighting(null);
      if (selectedTruck?.id) {
        animateMarker(selectedTruck.id, 1);
      }

      setSelectedTruck(truck);
      animateMarker(truckId, 1.3);

      mapRef.current?.animateToRegion({
        latitude: truck.location.latitude,
        longitude: truck.location.longitude,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }, 500);
    }
  };

  const handleSightingPress = (sighting: Sighting) => {
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    if (selectedTruck?.id) {
      animateMarker(selectedTruck.id, 1);
    }

    setSelectedTruck(null);
    setSelectedSighting(sighting);

    mapRef.current?.animateToRegion({
      latitude: sighting.latitude,
      longitude: sighting.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }, 500);
  };

  const handleMapPress = () => {
    if (selectedTruck || selectedSighting) {
      closeSheet();
      if (selectedTruck?.id) {
        animateMarker(selectedTruck.id, 1);
      }
    }
  };

  const handleFavoriteToggle = () => {
    if (!isAuthenticated) {
      setShowAuthPrompt(true);
      return;
    }
    if (!currentUser) {
      console.log('[FullMapScreen] Waiting for user profile to load');
      return;
    }
    if (selectedTruck) {
      if (Platform.OS !== 'web') {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      toggleFavorite(selectedTruck.id);
    }
  };

  useEffect(() => {
    if (selectedTruck || selectedSighting) {
      openSheet();
    }
  }, [selectedSighting, selectedTruck, openSheet]);

  const handleViewDetails = () => {
    if (selectedTruck) {
      router.push(`/(customer)/truck/${selectedTruck.id}` as any);
    }
  };

  useEffect(() => {
    const getUserLocation = async () => {
      if (Platform.OS === 'web') return;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

      } catch (error) {
        console.error('Error getting location:', error);
      }
    };

    void getUserLocation();
  }, []);

  useEffect(() => {
    void fetchSightings();
  }, [fetchSightings]);

  const handleFindMe = async () => {
    if (Platform.OS === 'web') {
      Alert.alert('Location', 'Location services are available on mobile only');
      return;
    }

    setIsLocating(true);

    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Please enable location permissions to use this feature');
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;

      mapRef.current?.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      }, 1000);
    } catch (error) {
      console.error('Error getting location:', error);
      Alert.alert('Error', 'Unable to get your location');
    } finally {
      setIsLocating(false);
    }
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {Platform.OS === 'web' ? (
        <View style={styles.webPlaceholder}>
          <Text style={styles.webPlaceholderText}>Map view available on mobile only</Text>
        </View>
      ) : (
        <>
          <MapView
            provider={PROVIDER_GOOGLE} 
            ref={mapRef} 
            style={styles.map} 
            initialRegion={mapRegion}
            onPress={handleMapPress}
            showsUserLocation={true}
          >
            
            {trucksForMap.map(truck => {
              const isOpen = isTruckOpenNow(truck.id);
              return (
                <Marker
                  key={truck.id}
                  coordinate={{
                    latitude: truck.location.latitude,
                    longitude: truck.location.longitude,
                  }}
                  pinColor={isOpen ? '#f97316' : '#9ca3af'}
                  title={truck.name}
                  description={truck.location?.address || 'Food truck'}
                  onPress={() => handleTruckPress(truck.id)}
                />
              );
            })}
            {sightings.map((sighting) => (
              <Marker
                key={`sighting-${sighting.id}`}
                coordinate={{
                  latitude: sighting.latitude,
                  longitude: sighting.longitude,
                }}
                title={sighting.truck_name}
                description="Recently Spotted"
                onPress={() => handleSightingPress(sighting)}
              >
                <View style={styles.sightingMarker}>
                  <View style={styles.sightingMarkerInner} />
                </View>
              </Marker>
            ))}
          </MapView>

          <TouchableOpacity
            style={styles.showClosedButton}
            onPress={() => setShowClosed(!showClosed)}
          >
            {showClosed ? (
              <EyeOff size={20} color={colors.text} />
            ) : (
              <Eye size={20} color={colors.text} />
            )}
            <Text style={styles.showClosedText}>
              {showClosed ? 'Hide Closed' : 'Show Closed'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.findMeButton, isLocating && styles.findMeButtonDisabled]}
            onPress={handleFindMe}
            disabled={isLocating}
          >
            <Target size={24} color={colors.background} />
          </TouchableOpacity>

          {!showClosed && openTrucks.length === 0 && sightings.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No trucks open right now</Text>
              <TouchableOpacity
                style={styles.emptyStateButton}
                onPress={() => setShowClosed(true)}
              >
                <Text style={styles.emptyStateButtonText}>Show closed trucks</Text>
              </TouchableOpacity>
            </View>
          )}

          {(selectedTruck || selectedSighting) && (
            <Animated.View 
              style={[
                styles.bottomSheet,
                {
                  transform: [{ translateY: sheetY }]
                }
              ]}
            >
              <View {...panResponder.panHandlers} style={styles.sheetHandle}>
                <View style={styles.handleBar} />
              </View>
              
              {selectedTruck ? (
                <TruckBottomSheet
                  truck={selectedTruck}
                  isFavorited={currentUser?.favorites.includes(selectedTruck.id) || false}
                  onViewDetails={handleViewDetails}
                  onToggleFavorite={handleFavoriteToggle}
                />
              ) : selectedSighting ? (
                <SightingBottomSheet sighting={selectedSighting} />
              ) : null}
            </Animated.View>
          )}

          <AuthPromptModal
            visible={showAuthPrompt}
            onClose={() => setShowAuthPrompt(false)}
            action="favorite this truck"
            returnRoute="/(customer)/(tabs)/full-map"
          />
        </>
      )}
    </View>
  );
}

type TruckBottomSheetProps = {
  truck: FoodTruck;
  isFavorited: boolean;
  onViewDetails: () => void;
  onToggleFavorite: () => void;
};

type SightingBottomSheetProps = {
  sighting: Sighting;
};

const openNavigation = (latitude: number, longitude: number) => {
  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${latitude},${longitude}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
  });
  
  Linking.openURL(url).catch((err) => {
    console.error('Failed to open maps:', err);
    Alert.alert('Error', 'Unable to open maps');
  });
};

function TruckBottomSheet({ truck, isFavorited, onViewDetails, onToggleFavorite }: TruckBottomSheetProps) {
  const { average, count } = useTruckRating(truck.id);
  const { isTruckOpenNow } = useApp();
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.sheetContent}>
      <Image source={truck.hero_image ? { uri: truck.hero_image } : undefined} style={styles.sheetHeroImage} />
      
      <View style={styles.sheetHeader}>
        <Image source={truck.logo ? { uri: truck.logo } : undefined} style={styles.sheetLogo} />
        <View style={styles.sheetInfo}>
          <Text style={styles.sheetName}>{truck.name}</Text>
          <Text style={styles.sheetCuisine}>{truck.cuisine_type}</Text>
          <View style={styles.sheetMeta}>
            <View style={[
              styles.statusBadge,
              { backgroundColor: isTruckOpenNow(truck.id) ? '#10B981' : '#6B7280' }
            ]}>
              <Text style={styles.statusText}>
                {isTruckOpenNow(truck.id) ? 'Open Now' : 'Closed'}
              </Text>
            </View>
            {count > 0 && (
              <View style={styles.ratingContainer}>
                <Star size={14} color="#FCD34D" fill="#FCD34D" />
                <Text style={styles.ratingText}>{average}</Text>
                <Text style={styles.ratingCount}>({count})</Text>
              </View>
            )}
          </View>
        </View>
      </View>

      <View style={styles.sheetButtons}>
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={onViewDetails}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>View</Text>
          <ChevronRight size={18} color={colors.background} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.primaryButton} 
          onPress={() => truck.location && openNavigation(truck.location.latitude, truck.location.longitude)}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryButtonText}>Navigate</Text>
          <Navigation size={18} color={colors.background} />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.favoriteButton} 
          onPress={onToggleFavorite}
          activeOpacity={0.8}
        >
          <Heart 
            size={24} 
            color={isFavorited ? colors.primary : colors.secondaryText}
            fill={isFavorited ? colors.primary : 'transparent'}
          />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function SightingBottomSheet({ sighting }: SightingBottomSheetProps) {
  const { colors } = useTheme();
  const styles = createStyles(colors);

  return (
    <View style={styles.sheetContent}>
      <Image
        source={sighting.photo_url ? { uri: sighting.photo_url } : undefined}
        style={styles.sheetHeroImage}
      />

      <View style={styles.sightingSheetHeader}>
        <Text style={styles.sheetName}>{sighting.truck_name}</Text>
        <View style={styles.sightingPill}>
          <Text style={styles.sightingPillText}>👀 Recently Spotted</Text>
        </View>
      </View>

      <Text style={styles.sightingTimestamp}>{formatSightingLastSeen(sighting.created_at)}</Text>
      {sighting.notes ? (
        <Text style={styles.sightingNotes}>{sighting.notes}</Text>
      ) : null}

      <TouchableOpacity
        style={styles.primaryButton}
        onPress={() => openNavigation(sighting.latitude, sighting.longitude)}
        activeOpacity={0.8}
      >
        <Text style={styles.primaryButtonText}>Navigate</Text>
        <Navigation size={18} color={colors.background} />
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  map: {
    width: '100%',
    height: '100%',
  },
  webPlaceholder: {
    flex: 1,
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webPlaceholderText: {
    fontSize: 16,
    color: colors.secondaryText,
  },

  userMarker: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#3B82F6',
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  userMarkerDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.background,
  },
  sightingMarker: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F59E0B',
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#92400E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  sightingMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FEF3C7',
  },
  showClosedButton: {
    position: 'absolute',
    top: 0,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.cardBackground,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  showClosedText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  emptyState: {
    position: 'absolute',
    bottom: 100,
    left: 20,
    right: 20,
    backgroundColor: colors.cardBackground,
    padding: 16,
    borderRadius: 16,
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.background,
  },
  findMeButton: {
    position: 'absolute',
    bottom: 32,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  findMeButtonDisabled: {
    backgroundColor: colors.secondaryText,
  },
  bottomSheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_MAX_HEIGHT,
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  sheetHandle: {
    alignItems: 'center',
    paddingTop: 12,
    paddingBottom: 8,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  sheetContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  sheetHeroImage: {
    width: '100%',
    height: 120,
    borderRadius: 16,
    backgroundColor: colors.secondaryBackground,
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
  },
  sheetLogo: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: colors.secondaryBackground,
  },
  sheetInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  sheetName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  sheetCuisine: {
    fontSize: 15,
    color: colors.secondaryText,
    marginBottom: 8,
  },
  sheetMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.background,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  ratingCount: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  sheetButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  sightingSheetHeader: {
    gap: 10,
    marginBottom: 10,
  },
  sightingPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sightingPillText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#92400E',
  },
  sightingTimestamp: {
    fontSize: 13,
    color: colors.secondaryText,
    marginBottom: 10,
  },
  sightingNotes: {
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
    marginBottom: 18,
  },
  primaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 14,
    gap: 6,
    elevation: 3,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  primaryButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.background,
  },
  favoriteButton: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
});
