import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Platform, Alert, Modal, RefreshControl, Animated } from 'react-native';
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { Search, MapPin, Clock, Navigation, CheckCircle, Maximize2, Minimize2, AlertCircle, XCircle, Radar, Compass, ArrowLeft } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useTheme } from '@/contexts/ThemeContext';
import { useFilteredTrucks, useApp } from '@/contexts/AppContext';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { formatSightingLastSeen, hasSightingCoordinates } from '@/lib/sightings';
import { Sighting } from '@/types';

const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

const hasMapLocation = (truck: any) =>
  Number.isFinite(truck?.location?.latitude) &&
  Number.isFinite(truck?.location?.longitude);

const hasCoordinates = (truck: any) =>
  Number.isFinite(truck?.location?.latitude) &&
  Number.isFinite(truck?.location?.longitude);

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { isTruckOpenNow, customerRadius, setCustomerRadius, exploreMode, setExploreMode, exploreCenter, setExploreCenter, refreshAllTrucks } = useApp();
  const { colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showClosed, setShowClosed] = useState<boolean>(false);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [isRadiusModalVisible, setIsRadiusModalVisible] = useState<boolean>(false);
  const [isExploreModalVisible, setIsExploreModalVisible] = useState<boolean>(false);
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tempExploreLocation, setTempExploreLocation] = useState<{ latitude: number; longitude: number; label: string }>({ latitude: 37.7749, longitude: -122.4194, label: 'San Francisco, CA' });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const spotMarkerScale = useRef(new Animated.Value(1)).current;

  const allTrucks = useFilteredTrucks('', 'All', false);

  const centerPoint = useMemo(() => {
    if (exploreMode && exploreCenter) return exploreCenter;
    return userLocation;
  }, [exploreMode, exploreCenter, userLocation]);

  const openTruckIds = useMemo(() => {
    const ids = new Set<string>();
    for (const truck of allTrucks) {
      if (isTruckOpenNow(truck.id)) {
        ids.add(truck.id);
      }
    }
    return ids;
  }, [allTrucks, isTruckOpenNow]);

  const mapTrucks = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    const result = allTrucks.filter((truck: any) => {
      if (truck?.archived === true || truck?.archivedAt) return false;

      if (!hasMapLocation(truck)) return false;

      if (centerPoint) {
        const distance = calculateDistance(
          centerPoint.latitude,
          centerPoint.longitude,
          truck.location.latitude,
          truck.location.longitude
        );
        if (distance > customerRadius) return false;
      }

      if (trimmedQuery) {
        const searchableFields = [
          truck.name || '',
          truck.cuisine_type || '',
          truck.bio || '',
          truck.location?.address || '',
          ...(truck.search_keywords || []),
        ];
        if (!searchableFields.some(field => field.toLowerCase().includes(trimmedQuery))) return false;
      }

      if (!showClosed && !openTruckIds.has(truck.id)) return false;

      return true;
    });

    return result;
  }, [allTrucks, centerPoint, customerRadius, searchQuery, showClosed, openTruckIds]);

  const listTrucks = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    return allTrucks.filter((truck: any) => {
      if (truck?.archived === true || truck?.archivedAt) return false;

      if (centerPoint && hasCoordinates(truck)) {
        const distance = calculateDistance(
          centerPoint.latitude,
          centerPoint.longitude,
          truck.location.latitude,
          truck.location.longitude
        );
        if (distance > customerRadius) return false;
      }

      if (trimmedQuery) {
        const searchableFields = [
          truck.name || '',
          truck.cuisine_type || '',
          truck.bio || '',
          truck.location?.address || '',
          ...(truck.search_keywords || []),
        ];
        if (!searchableFields.some(field => field.toLowerCase().includes(trimmedQuery))) return false;
      }

      if (!showClosed && !openTruckIds.has(truck.id)) return false;

      return true;
    });
  }, [allTrucks, centerPoint, customerRadius, searchQuery, showClosed, openTruckIds]);

  const mapRegion = useMemo(() => {
    const center = centerPoint || { latitude: 37.7181, longitude: -85.9011 };
    return {
      latitude: center.latitude,
      longitude: center.longitude,
      latitudeDelta: 0.15,
      longitudeDelta: 0.15,
    };
  }, [centerPoint]);

  const handleTruckPress = (truckId: string) => {
    setSelectedSighting(null);
    router.push(`/(customer)/truck/${truckId}` as any);
  };

  const handleSightingPress = (sighting: Sighting) => {
    setSelectedSighting(sighting);
  };

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
      console.error('[Discover] Failed to load sightings:', error);
    }
  }, []);

  useEffect(() => {
    const getUserLocation = async () => {
      if (Platform.OS === 'web') return;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
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

  useEffect(() => {
    if (centerPoint && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: centerPoint.latitude,
        longitude: centerPoint.longitude,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }, 500);
    }
  }, [centerPoint]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(spotMarkerScale, {
          toValue: 1.05,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(spotMarkerScale, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
      spotMarkerScale.stopAnimation();
    };
  }, [spotMarkerScale]);

  const handleEnableExplore = () => {
    setIsExploreModalVisible(true);
  };

  const handleSetExploreLocation = () => {
    setExploreCenter(tempExploreLocation);
    setExploreMode(true);
    setIsExploreModalVisible(false);
  };

  const handleBackToLocal = () => {
    setExploreMode(false);
    setExploreCenter(null);
    if (userLocation) {
      mapRef.current?.animateToRegion({
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
        latitudeDelta: 0.15,
        longitudeDelta: 0.15,
      }, 500);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshAllTrucks();
      await fetchSightings();
    } catch (err) {
      console.log('[Discover] Refresh error:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const predefinedLocations = [
  { label: 'Louisville, KY', latitude: 38.2527, longitude: -85.7585 },
  { label: 'Lexington, KY', latitude: 38.0406, longitude: -84.5037 },
  { label: 'Bowling Green, KY', latitude: 36.9685, longitude: -86.4808 },
  { label: 'Elizabethtown, KY', latitude: 37.6939, longitude: -85.8591 },
  { label: 'Owensboro, KY', latitude: 37.7719, longitude: -87.1112 },

  { label: 'Cincinnati, OH', latitude: 39.1031, longitude: -84.5120 },
  { label: 'Nashville, TN', latitude: 36.1627, longitude: -86.7816 },
  { label: 'Indianapolis, IN', latitude: 39.7684, longitude: -86.1581 },
  { label: 'Knoxville, TN', latitude: 35.9606, longitude: -83.9207 },
  { label: 'St. Louis, MO', latitude: 38.6270, longitude: -90.1994 },
];
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

      setUserLocation({ latitude, longitude });

      mapRef.current?.animateToRegion({
        latitude,
        longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
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
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Search size={20} color={colors.secondaryText} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search trucks or cuisine..."
            placeholderTextColor={colors.secondaryText}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>
      </View>

      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[styles.filterChip, showClosed && styles.filterChipActive]}
          onPress={() => setShowClosed(!showClosed)}
        >
          <Clock size={16} color={showClosed ? colors.background : colors.secondaryText} />
          <Text style={[styles.filterChipText, showClosed && styles.filterChipTextActive]}>
            Show Closed
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterChip}
          onPress={() => setIsRadiusModalVisible(true)}
        >
          <Radar size={16} color={colors.secondaryText} />
          <Text style={styles.filterChipText}>
            {customerRadius} mi
          </Text>
        </TouchableOpacity>
        {!exploreMode ? (
          <TouchableOpacity
            style={styles.filterChip}
            onPress={handleEnableExplore}
          >
            <Compass size={16} color={colors.secondaryText} />
            <Text style={styles.filterChipText}>Explore</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.filterChip, styles.exploreBadge]}
            onPress={handleBackToLocal}
          >
            <ArrowLeft size={14} color={colors.background} />
            <Text style={[styles.filterChipText, styles.exploreBadgeText]}>Exploring • Back to Local</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={[styles.mapContainer, isMapExpanded && styles.mapContainerExpanded]}>
        {Platform.OS === 'web' ? (
          <View style={styles.mapPlaceholder}>
            <MapPin size={48} color={colors.secondaryText} />
            <Text style={styles.mapPlaceholderText}>Map view (mobile only)</Text>
          </View>
        ) : (
          <>
            {exploreMode && exploreCenter && (
              <View style={styles.exploreInfo}>
                <MapPin size={14} color={colors.primary} />
                <View style={styles.exploreInfoTextContainer}>
                  <Text style={styles.exploreInfoText}>{exploreCenter.label || 'Custom location'}</Text>
                  <Text style={styles.exploreInfoSubtext}>Browsing trucks beyond your area</Text>
                </View>
              </View>
            )}
            <MapView ref={mapRef} style={styles.map} initialRegion={mapRegion} showsUserLocation={true} provider={PROVIDER_GOOGLE}>
              {centerPoint && (
                <>
                  <Circle
                    center={centerPoint}
                    radius={customerRadius * 1609.34}
                    fillColor="rgba(59, 130, 246, 0.1)"
                    strokeColor="rgba(59, 130, 246, 0.4)"
                    strokeWidth={2}
                  />
                </>
              )}
              {mapTrucks.map((truck: any) => {
                const isOpen = openTruckIds.has(truck.id);
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
              style={styles.findMeButton}
              onPress={handleFindMe}
              disabled={isLocating}
            >
              <Navigation size={20} color={isLocating ? colors.secondaryText : colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setIsMapExpanded(!isMapExpanded)}
            >
              {isMapExpanded ? (
                <Minimize2 size={20} color={colors.primary} />
              ) : (
                <Maximize2 size={20} color={colors.primary} />
              )}
            </TouchableOpacity>
          </>
        )}
      </View>

      <View style={styles.listContainer}>
        <View style={styles.listHeader}>
          <Text style={styles.listTitle}>
            {showClosed ? 'All Trucks' : 'Open Now'} ({listTrucks.length})
          </Text>
        </View>
        {listTrucks.length === 0 ? (
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateCard}>
              {searchQuery.trim() ? (
                <>
                  <XCircle size={48} color={colors.secondaryText} strokeWidth={1.5} />
                  <Text style={styles.emptyStateTitle}>No matches</Text>
                  <Text style={styles.emptyStateSubtitle}>Try searching for something else, or start fresh.</Text>
                  <TouchableOpacity
                    style={styles.emptyStateButton}
                    onPress={() => setSearchQuery('')}
                  >
                    <Text style={styles.emptyStateButtonText}>Clear search</Text>
                  </TouchableOpacity>
                </>
              ) : !showClosed ? (
                <>
                  <Clock size={48} color={colors.secondaryText} strokeWidth={1.5} />
                  <Text style={styles.emptyStateTitle}>Everything&apos;s closed right now</Text>
                  <Text style={styles.emptyStateSubtitle}>Want to browse anyway? Tap below to see all trucks.</Text>
                  <TouchableOpacity
                    style={styles.emptyStateButton}
                    onPress={() => setShowClosed(true)}
                  >
                    <Text style={styles.emptyStateButtonText}>Show Closed</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <AlertCircle size={48} color={colors.secondaryText} strokeWidth={1.5} />
                  <Text style={styles.emptyStateTitle}>No trucks nearby</Text>
                  <Text style={styles.emptyStateSubtitle}>Try widening your search radius, or check back when more trucks are live on the map.</Text>
                  <TouchableOpacity
                    style={styles.emptyStateButton}
                    onPress={() => setIsRadiusModalVisible(true)}
                  >
                    <Text style={styles.emptyStateButtonText}>Increase radius</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        ) : (
          <ScrollView 
            style={styles.list} 
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            }
          >
            {listTrucks.map((truck, index) => (
              <React.Fragment key={truck.id}>
                {index === 0 && (
                  <TouchableOpacity
                    style={[styles.truckCard, styles.spotListCard]}
                    onPress={() => router.push('/(customer)/add-sighting' as any)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.truckLogo, styles.spotListIconWrap]}>
                      <Animated.View
                        style={[
                          styles.spotListMarker,
                          { transform: [{ scale: spotMarkerScale }] },
                        ]}
                      >
                        <View style={styles.spotListMarkerInner} />
                      </Animated.View>
                    </View>
                    <View style={styles.truckInfo}>
                      <Text style={styles.truckName}>Seen a food truck?</Text>
                      <Text style={styles.truckCuisine}>Drop it on the map</Text>
                      <Text style={styles.spotListAction}>+ Add a Spot</Text>
                    </View>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.truckCard}
                  onPress={() => handleTruckPress(truck.id)}
                >
                  <Image source={truck.logo ? { uri: truck.logo } : undefined} style={styles.truckLogo} />
                  <View style={styles.truckInfo}>
                    <View style={styles.truckNameRow}>
                      <Text style={styles.truckName}>{truck.name}</Text>
                      {truck.verified && (
                        <CheckCircle size={16} color={colors.success} fill={colors.success} />
                      )}
                    </View>
                    <Text style={styles.truckCuisine}>{truck.cuisine_type}</Text>
                    <View style={styles.truckMeta}>
                      <View style={[styles.statusBadge, openTruckIds.has(truck.id) && { backgroundColor: `${colors.success}20` }]}>
                        <Text style={[styles.statusText, openTruckIds.has(truck.id) && { color: colors.success }]}>
                          {openTruckIds.has(truck.id) ? 'Open' : 'Closed'}
                        </Text>
                      </View>
                      <Text style={styles.truckDistance}>
                        {truck.location?.address
                          ? truck.location.address.split(',')[0]
                          : openTruckIds.has(truck.id)
                          ? 'Location available'
                          : 'Not currently serving'}
                      </Text>
                    </View>
                  </View>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </ScrollView>
        )}
      </View>

      <Modal
        visible={selectedSighting !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedSighting(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setSelectedSighting(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.sightingModalContent}
          >
            <Image
              source={selectedSighting?.photo_url ? { uri: selectedSighting.photo_url } : undefined}
              style={styles.sightingImage}
              contentFit="cover"
            />
            <Text style={styles.sightingName}>{selectedSighting?.truck_name}</Text>
            <View style={styles.sightingBadge}>
              <Text style={styles.sightingBadgeText}>👀 Recently Spotted</Text>
            </View>
            <Text style={styles.sightingTimestamp}>
              {formatSightingLastSeen(selectedSighting?.created_at)}
            </Text>
            {selectedSighting?.notes ? (
              <Text style={styles.sightingNotes}>{selectedSighting.notes}</Text>
            ) : null}
            <TouchableOpacity
              style={styles.sightingCloseButton}
              onPress={() => setSelectedSighting(null)}
            >
              <Text style={styles.sightingCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={isRadiusModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setIsRadiusModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsRadiusModalVisible(false)}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Radius</Text>
            <Text style={styles.modalSubtitle}>Show trucks within:</Text>
            {[5, 10, 25, 50, 100].map(radius => (
              <TouchableOpacity
                key={radius}
                style={[
                  styles.radiusOption,
                  customerRadius === radius && styles.radiusOptionSelected,
                ]}
                onPress={() => {
                  setCustomerRadius(radius);
                  setIsRadiusModalVisible(false);
                }}
              >
                <Text style={[
                  styles.radiusOptionText,
                  customerRadius === radius && styles.radiusOptionTextSelected,
                ]}>
                  {radius} miles
                </Text>
                {customerRadius === radius && (
                  <CheckCircle size={20} color={colors.primary} fill={colors.primary} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        visible={isExploreModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setIsExploreModalVisible(false)}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsExploreModalVisible(false)}
        >
          <TouchableOpacity 
            activeOpacity={1} 
            onPress={(e) => e.stopPropagation()}
            style={styles.exploreModalContent}
          >
            <Text style={styles.modalTitle}>Explore Food Trucks</Text>
            <Text style={styles.exploreModalSubtitle}>
              Browse trucks in another city—perfect for road trips or when you&apos;re bored.
            </Text>
            
            <Text style={styles.exploreModalSectionTitle}>Select a city:</Text>
            <ScrollView style={styles.locationsList} showsVerticalScrollIndicator={false}>
              {predefinedLocations.map((location) => (
                <TouchableOpacity
                  key={location.label}
                  style={[
                    styles.locationOption,
                    tempExploreLocation.label === location.label && styles.locationOptionSelected,
                  ]}
                  onPress={() => setTempExploreLocation(location)}
                >
                  <MapPin size={18} color={tempExploreLocation.label === location.label ? colors.primary : colors.secondaryText} />
                  <Text style={[
                    styles.locationOptionText,
                    tempExploreLocation.label === location.label && styles.locationOptionTextSelected,
                  ]}>
                    {location.label}
                  </Text>
                  {tempExploreLocation.label === location.label && (
                    <CheckCircle size={20} color={colors.primary} fill={colors.primary} />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
            
            <TouchableOpacity
              style={styles.exploreModalButton}
              onPress={handleSetExploreLocation}
            >
              <Text style={styles.exploreModalButtonText}>Explore this city</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.exploreModalCancelButton}
              onPress={() => setIsExploreModalVisible(false)}
            >
              <Text style={styles.exploreModalCancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  searchContainer: {
    paddingHorizontal: 20,
    marginTop: 8,
    marginBottom: 6,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  filterContainer: {
    flexDirection: 'row',
    flexWrap: 'nowrap' as const,
    paddingLeft: 20,
    paddingRight: 16,
    marginBottom: 6,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.secondaryBackground,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
  },
  filterChipText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: colors.secondaryText,
  },
  filterChipTextActive: {
    color: colors.background,
  },
  mapContainer: {
    height: 125,
    marginHorizontal: 20,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 8,
  },
  mapContainerExpanded: {
    height: 280,
  },
  map: {
    flex: 1,
  },
  mapPlaceholder: {
    flex: 1,
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 14,
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
    width: 26,
    height: 26,
    borderRadius: 13,
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
  listContainer: {
    flex: 1,
    paddingHorizontal: 20,
    marginTop: 4,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  listTitle: {
    fontSize: 17,
    fontWeight: '600' as const,
    color: colors.text,
  },
  list: {
    flex: 1,
  },
  truckCard: {
    flexDirection: 'row',
    backgroundColor: colors.cardBackground,
    borderRadius: 14,
    padding: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  truckLogo: {
    width: 72,
    height: 72,
    borderRadius: 11,
    backgroundColor: colors.secondaryBackground,
  },
  spotListCard: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    paddingVertical: 8,
  },
  spotListIconWrap: {
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spotListMarker: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F59E0B',
    borderWidth: 3,
    borderColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  spotListMarkerInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FEF3C7',
  },
  truckInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  truckNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  truckName: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
  },
  truckCuisine: {
    fontSize: 14,
    color: colors.secondaryText,
    marginBottom: 8,
  },
  spotListAction: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  truckMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: colors.secondaryBackground,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.secondaryText,
  },
  truckDistance: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  findMeButton: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  expandButton: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.cardBackground,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyStateCard: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    maxWidth: 320,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: colors.secondaryText,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyStateButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 8,
  },
  emptyStateButtonText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.background,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 16,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 14,
    color: colors.secondaryText,
    marginBottom: 16,
  },
  radiusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.secondaryBackground,
    marginBottom: 8,
  },
  radiusOptionSelected: {
    backgroundColor: `${colors.primary}15`,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  radiusOptionText: {
    fontSize: 16,
    fontWeight: '500' as const,
    color: colors.text,
  },
  radiusOptionTextSelected: {
    fontWeight: '600' as const,
    color: colors.primary,
  },
  exploreBadge: {
    backgroundColor: colors.primary,
  },
  exploreBadgeText: {
    color: colors.background,
  },
  exploreInfo: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: colors.cardBackground,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  exploreInfoTextContainer: {
    flex: 1,
  },
  exploreInfoText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.text,
  },
  exploreInfoSubtext: {
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 1,
  },
  exploreCenterMarker: {
    backgroundColor: colors.primary,
  },
  exploreModalContent: {
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  exploreModalSubtitle: {
    fontSize: 15,
    color: colors.secondaryText,
    marginBottom: 20,
    lineHeight: 22,
  },
  exploreModalSectionTitle: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
  },
  locationsList: {
    maxHeight: 320,
    marginBottom: 20,
  },
  locationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: colors.secondaryBackground,
    marginBottom: 8,
  },
  locationOptionSelected: {
    backgroundColor: `${colors.primary}15`,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  locationOptionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500' as const,
    color: colors.text,
  },
  locationOptionTextSelected: {
    fontWeight: '600' as const,
    color: colors.primary,
  },
  exploreModalButton: {
    backgroundColor: colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  exploreModalButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.background,
  },
  exploreModalCancelButton: {
    paddingVertical: 12,
    alignItems: 'center',
  },
  exploreModalCancelButtonText: {
    fontSize: 15,
    fontWeight: '500' as const,
    color: colors.secondaryText,
  },
  sightingModalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.cardBackground,
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sightingImage: {
    width: '100%',
    height: 190,
    borderRadius: 16,
    backgroundColor: colors.secondaryBackground,
    marginBottom: 14,
  },
  sightingName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 10,
  },
  sightingBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 10,
  },
  sightingBadgeText: {
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
    marginBottom: 16,
  },
  sightingCloseButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sightingCloseButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.background,
  },
});
