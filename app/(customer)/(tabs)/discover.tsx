import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { AppState as RNAppState, View, Text, StyleSheet, TextInput, ScrollView, TouchableOpacity, Platform, Alert, Modal, RefreshControl, Animated, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useRouter } from 'expo-router';
import { Search, MapPin, Clock, Navigation, CheckCircle, Maximize2, Minimize2, AlertCircle, XCircle, Radar, Compass, ArrowLeft, Star } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useFilteredTrucks, useApp } from '@/contexts/AppContext';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { addSpotterNamesToSightings, formatSightingLastSeen, formatSightingSpotter, getSafeSpotterDisplayName, hasSightingCoordinates } from '@/lib/sightings';
import { FoodTruck, Sighting } from '@/types';
import { getValidatedCoordinate, isValidCoordinate } from '@/lib/mapValidation';
import { getTruckDisplayLocation } from '@/lib/truckLocation';
import { canViewIncompleteTruckProfile } from '@/lib/truckProfileCompleteness';
import { getPublicReadyStatus, isTruckPublicReady } from '@/lib/truckPublicReady';
import { useLocationPermissionPrompt } from '@/hooks/useLocationPermissionPrompt';
import LocationPermissionCard from '@/components/map/LocationPermissionCard';

const OPEN_TRUCK_MARKER_COLOR = '#f97316';
const CLOSED_TRUCK_MARKER_COLOR = '#800080';
const FOREGROUND_SCREEN_REFRESH_DEBOUNCE_MS = 5000;
const SIGHTING_NOTES_MAX_LENGTH = 280;

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
  isValidCoordinate(truck?.location);

const hasCoordinates = (truck: any) =>
  isValidCoordinate(truck?.location);

const formatSightingCoordinate = (value?: number | null) =>
  typeof value === 'number' && Number.isFinite(value) ? value.toFixed(5) : '';

const getSightingLocationText = (sighting?: Sighting | null) => {
  if (!sighting) return 'Location unavailable';

  const address =
    (sighting as any).address ||
    (sighting as any).location_address ||
    (sighting as any).formatted_address ||
    (sighting as any).location?.address;

  if (typeof address === 'string' && address.trim()) {
    return address.trim();
  }

  const latitude = formatSightingCoordinate(sighting.latitude);
  const longitude = formatSightingCoordinate(sighting.longitude);

  if (latitude && longitude) {
    return `Location: ${latitude}, ${longitude}`;
  }

  return 'Location unavailable';
};

const formatCardStopDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Time not set';

  const dateText = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  const timeText = date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${dateText} @ ${timeText}`;
};

const formatCardLocationFallback = (address?: string | null) => {
  const trimmed = address?.trim();
  if (!trimmed) return '';

  const parts = trimmed
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    const city = parts[parts.length - 2];
    const state = parts[parts.length - 1].replace(/\s+\d{5}(?:-\d{4})?$/, '');
    return [city, state].filter(Boolean).join(', ');
  }

  return trimmed;
};

const openSightingNavigation = (latitude?: number, longitude?: number) => {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    Alert.alert('Location unavailable', 'This sighting does not have a usable location.');
    return;
  }

  const url = Platform.select({
    ios: `http://maps.apple.com/?daddr=${latitude},${longitude}`,
    default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
  });

  Linking.openURL(url).catch((error) => {
    console.log('[Discover] Failed to open sighting navigation:', error);
    Alert.alert('Error', 'Unable to open maps.');
  });
};

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { currentUser, foodTrucks, isTruckOpenNow, getNextUpcomingStopForTruck, getTruckActivityStatus, customerRadius, setCustomerRadius, exploreMode, setExploreMode, exploreCenter, setExploreCenter, refreshAllTrucks, reviews, showClosed, setShowClosed } = useApp();
  const { colors } = useTheme();
  const {
    userLocation,
    showPrompt: showLocationPrompt,
    promptAnim: locationPromptAnim,
    handleAllow: handleAllowLocation,
    handleDismiss: dismissLocationPromptCard,
    refreshLocationIfGranted,
    requestLocationNow,
  } = useLocationPermissionPrompt();
  const mapRef = useRef<MapView>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [isRadiusModalVisible, setIsRadiusModalVisible] = useState<boolean>(false);
  const [isExploreModalVisible, setIsExploreModalVisible] = useState<boolean>(false);
  const [tempExploreLocation, setTempExploreLocation] = useState<{ latitude: number; longitude: number; label: string }>({ latitude: 37.7749, longitude: -122.4194, label: 'San Francisco, CA' });
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [sightings, setSightings] = useState<Sighting[]>([]);
  const [selectedSighting, setSelectedSighting] = useState<Sighting | null>(null);
  const [isEditingSighting, setIsEditingSighting] = useState(false);
  const [editingSightingTitle, setEditingSightingTitle] = useState('');
  const [editingSightingNotes, setEditingSightingNotes] = useState('');
  const [isSavingSightingEdit, setIsSavingSightingEdit] = useState(false);
  const [isDeletingSighting, setIsDeletingSighting] = useState(false);
  const spotMarkerScale = useRef(new Animated.Value(1)).current;
  const appStateRef = useRef(RNAppState.currentState);
  const lastForegroundRefreshAtRef = useRef(0);
  const foregroundRefreshInFlightRef = useRef(false);
  const lastDiscoverDebugSignatureRef = useRef('');

  const allTrucks = useFilteredTrucks('', 'All', false);
  const isAdmin = currentUser?.role === 'admin';

  const ratingsByTruckId = useMemo(() => {
    const totals = new Map<string, { sum: number; count: number }>();

    for (const review of reviews) {
      const current = totals.get(review.truckId) ?? { sum: 0, count: 0 };
      current.sum += review.rating;
      current.count += 1;
      totals.set(review.truckId, current);
    }

    return totals;
  }, [reviews]);

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

  const getDistanceFromCenter = useCallback((truck: FoodTruck): number | null => {
    if (!centerPoint || !hasCoordinates(truck)) return null;

    return calculateDistance(
      centerPoint.latitude,
      centerPoint.longitude,
      truck.location.latitude,
      truck.location.longitude
    );
  }, [centerPoint]);

  const sortTrucksByReliability = useCallback((trucks: FoodTruck[]) => (
    trucks
      .map((truck, index) => {
        const activityStatus = getTruckActivityStatus(truck);
        const lastActivityTime = activityStatus.lastActivityAt
          ? Date.parse(activityStatus.lastActivityAt)
          : 0;

        return {
          truck,
          index,
          openNow: openTruckIds.has(truck.id),
          hasUpcomingStop: activityStatus.hasUpcomingStop,
          activeOnTruckTap: activityStatus.activeOnTruckTap,
          lastActivityTime: Number.isFinite(lastActivityTime) ? lastActivityTime : 0,
          distance: getDistanceFromCenter(truck),
          name: truck.name?.trim().toLowerCase() ?? '',
        };
      })
      .sort((a, b) => {
        if (a.openNow !== b.openNow) return a.openNow ? -1 : 1;
        if (a.hasUpcomingStop !== b.hasUpcomingStop) return a.hasUpcomingStop ? -1 : 1;
        if (a.activeOnTruckTap !== b.activeOnTruckTap) return a.activeOnTruckTap ? -1 : 1;
        if (a.lastActivityTime !== b.lastActivityTime) return b.lastActivityTime - a.lastActivityTime;

        if (a.distance !== null && b.distance !== null && a.distance !== b.distance) {
          return a.distance - b.distance;
        }

        const nameCompare = a.name.localeCompare(b.name);
        if (nameCompare !== 0) return nameCompare;

        return a.index - b.index;
      })
      .map(item => item.truck)
  ), [getDistanceFromCenter, getTruckActivityStatus, openTruckIds]);

  const mapTrucks = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    const result = allTrucks.filter((truck: FoodTruck) => {
      if (truck?.archived === true || truck?.archivedAt) return false;

      if (!hasMapLocation(truck)) return false;

      if (trimmedQuery) {
        const searchableFields = [
          truck.name || '',
          truck.cuisine_type || '',
          truck.bio || '',
          truck.service_area || '',
          truck.location?.address || '',
          ...(truck.search_keywords || []),
        ];
        if (!searchableFields.some(field => field.toLowerCase().includes(trimmedQuery))) return false;
      }

      if (!showClosed && !openTruckIds.has(truck.id)) return false;

      return true;
    });

    return sortTrucksByReliability(result);
  }, [allTrucks, searchQuery, showClosed, openTruckIds, sortTrucksByReliability]);

  const listTrucks = useMemo(() => {
    const trimmedQuery = searchQuery.trim().toLowerCase();

    const result = allTrucks.filter((truck: FoodTruck) => {
      if (truck?.archived === true || truck?.archivedAt) return false;

      if (!isAdmin && centerPoint && hasCoordinates(truck)) {
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
          truck.service_area || '',
          truck.location?.address || '',
          ...(truck.search_keywords || []),
        ];
        if (!searchableFields.some(field => field.toLowerCase().includes(trimmedQuery))) return false;
      }

      if (!showClosed && !openTruckIds.has(truck.id)) return false;

      return true;
    });

    return sortTrucksByReliability(result);
  }, [allTrucks, centerPoint, customerRadius, isAdmin, searchQuery, showClosed, openTruckIds, sortTrucksByReliability]);

  useEffect(() => {
    if (!__DEV__) return;

    const trimmedQuery = searchQuery.trim().toLowerCase();
    const matchesSearch = (truck: FoodTruck) => {
      if (!trimmedQuery) return true;

      const searchableFields = [
        truck.name || '',
        truck.cuisine_type || '',
        truck.bio || '',
        truck.service_area || '',
        truck.location?.address || '',
        ...(truck.search_keywords || []),
      ];

      return searchableFields.some(field => field.toLowerCase().includes(trimmedQuery));
    };
    const distanceFromCenter = (truck: FoodTruck): number | null => {
      if (!centerPoint || !hasCoordinates(truck)) return null;
      return calculateDistance(
        centerPoint.latitude,
        centerPoint.longitude,
        truck.location.latitude,
        truck.location.longitude
      );
    };
    const completeTrucks = foodTrucks.filter(truck => isTruckPublicReady(truck));
    const completeClosedTrucks = completeTrucks.filter(truck => !isTruckOpenNow(truck.id));
    const incompleteFiltered = foodTrucks.filter(truck =>
      truck.archived !== true &&
      !truck.archivedAt &&
      truck.is_test !== true &&
      !canViewIncompleteTruckProfile(truck, currentUser)
    );
    const incompleteSamples = incompleteFiltered.slice(0, 12).map(truck => ({
      id: truck.id,
      name: truck.name,
      missing: getPublicReadyStatus(truck).missing,
      hasValidLocation: hasCoordinates(truck),
      openNow: isTruckOpenNow(truck.id),
      serviceArea: truck.service_area || null,
    }));

    const mapAfterArchived = allTrucks.filter(truck => truck?.archived !== true && !truck?.archivedAt);
    const mapAfterValidLocation = mapAfterArchived.filter(hasMapLocation);
    const mapAfterSearch = mapAfterValidLocation.filter(matchesSearch);
    const mapAfterShowClosed = showClosed
      ? mapAfterSearch
      : mapAfterSearch.filter(truck => openTruckIds.has(truck.id));

    const listAfterArchived = allTrucks.filter(truck => truck?.archived !== true && !truck?.archivedAt);
    const listAfterRadius = listAfterArchived.filter(truck => {
      if (!isAdmin && centerPoint && hasCoordinates(truck)) {
        const distance = distanceFromCenter(truck);
        return distance === null || distance <= customerRadius;
      }
      return true;
    });
    const listAfterSearch = listAfterRadius.filter(matchesSearch);
    const listAfterShowClosed = showClosed
      ? listAfterSearch
      : listAfterSearch.filter(truck => openTruckIds.has(truck.id));

    const debugPayload = {
      source: 'CustomerDiscover',
      viewerRole: currentUser?.role ?? 'guest',
      showClosed,
      searchQuery,
      customerRadius,
      hasCenterPoint: !!centerPoint,
      totalTrucksLoaded: foodTrucks.length,
      rawValidLocationCount: foodTrucks.filter(hasCoordinates).length,
      sharedVisibleCountBeforeDiscoverFilters: allTrucks.length,
      hiddenIncompleteProfileFilteredBeforeDiscover: incompleteFiltered.length,
      incompleteSamples,
      completeClosedTruckCount: completeClosedTrucks.length,
      completeClosedTrucksWouldPassShowClosed: showClosed,
      mapPipeline: {
        beforeFilters: allTrucks.length,
        afterArchivedFilter: mapAfterArchived.length,
        afterValidLocationFilter: mapAfterValidLocation.length,
        validLocationFiltered: mapAfterArchived.length - mapAfterValidLocation.length,
        afterSearchFilter: mapAfterSearch.length,
        searchFiltered: mapAfterValidLocation.length - mapAfterSearch.length,
        afterShowClosedFilter: mapAfterShowClosed.length,
        showClosedFiltered: mapAfterSearch.length - mapAfterShowClosed.length,
        renderedCount: mapTrucks.length,
      },
      listPipeline: {
        beforeFilters: allTrucks.length,
        afterArchivedFilter: listAfterArchived.length,
        afterRadiusFilter: listAfterRadius.length,
        radiusFiltered: listAfterArchived.length - listAfterRadius.length,
        afterSearchFilter: listAfterSearch.length,
        searchFiltered: listAfterRadius.length - listAfterSearch.length,
        afterShowClosedFilter: listAfterShowClosed.length,
        showClosedFiltered: listAfterSearch.length - listAfterShowClosed.length,
        renderedCount: listTrucks.length,
      },
      currentBehaviorNotes: {
        showClosedIncludesCompleteClosedListTrucks: showClosed,
        mapRequiresValidCurrentLocationEvenWhenShowClosed: true,
        listRequiresValidCurrentLocationOnlyForRadiusCheck: !!centerPoint && !isAdmin,
      },
    };
    const debugSignature = JSON.stringify(debugPayload);
    if (lastDiscoverDebugSignatureRef.current !== debugSignature) {
      lastDiscoverDebugSignatureRef.current = debugSignature;
      console.log('[DiscoverDebug] screen filter pipeline', debugPayload);
    }
  }, [
    allTrucks,
    centerPoint,
    currentUser,
    customerRadius,
    foodTrucks,
    isAdmin,
    isTruckOpenNow,
    listTrucks.length,
    mapTrucks.length,
    openTruckIds,
    searchQuery,
    showClosed,
  ]);

  const hasFeedContent = listTrucks.length > 0 || sightings.length > 0;

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
    setIsEditingSighting(false);
    setEditingSightingTitle('');
    setEditingSightingNotes('');
  };

  const selectedSightingIsOwned = !!(
    currentUser?.id &&
    selectedSighting?.user_id &&
    currentUser.id === selectedSighting.user_id
  );

  useEffect(() => {
    if (__DEV__ && selectedSighting) {
      console.log('[Discover] Sighting ownership check:', {
        sightingId: selectedSighting.id,
        sightingUserId: selectedSighting.user_id ?? null,
        currentUserId: currentUser?.id ?? null,
        owned: selectedSightingIsOwned,
      });
    }
  }, [currentUser?.id, selectedSighting, selectedSightingIsOwned]);

  const handleStartEditSighting = useCallback(() => {
    if (!selectedSighting || !selectedSightingIsOwned) return;

    setEditingSightingTitle(selectedSighting.truck_name ?? '');
    setEditingSightingNotes(selectedSighting.notes ?? '');
    setIsEditingSighting(true);
  }, [selectedSighting, selectedSightingIsOwned]);

  const handleSaveSightingEdit = useCallback(async () => {
    if (!currentUser?.id || !selectedSighting || !selectedSightingIsOwned) return;

    const trimmedTitle = editingSightingTitle.trim();
    const trimmedNotes = editingSightingNotes.trim();

    if (!trimmedTitle) {
      Alert.alert('Name required', 'Please add a truck or sighting name.');
      return;
    }

    if (trimmedNotes.length > SIGHTING_NOTES_MAX_LENGTH) {
      Alert.alert('Notes too long', `Please keep notes under ${SIGHTING_NOTES_MAX_LENGTH} characters.`);
      return;
    }

    if (__DEV__) {
      console.log('[Discover] Sighting edit submit attempt:', {
        sightingId: selectedSighting.id,
        userId: currentUser.id,
        titleChanged: trimmedTitle !== selectedSighting.truck_name,
        notesChanged: trimmedNotes !== (selectedSighting.notes ?? ''),
      });
    }

    setIsSavingSightingEdit(true);

    try {
      const { data, error } = await supabase
        .from('sightings')
        .update({
          truck_name: trimmedTitle,
          notes: trimmedNotes || null,
        })
        .eq('id', selectedSighting.id)
        .eq('user_id', currentUser.id)
        .select('*')
        .single();

      if (__DEV__) {
        console.log('[Discover] Expanded sighting edit Supabase result:', {
          sightingId: selectedSighting.id,
          error: error?.message ?? null,
          updated: !!data,
        });
      }

      if (error) throw error;

      const updatedSighting = {
        ...selectedSighting,
        ...(data as Sighting),
        spotted_by_name: selectedSighting.spotted_by_name,
      };

      setSightings(prev => prev.map(sighting => (
        sighting.id === selectedSighting.id ? updatedSighting : sighting
      )));
      setSelectedSighting(updatedSighting);
      setIsEditingSighting(false);
    } catch (error: any) {
      console.log('[Discover] Failed to update sighting:', error?.message ?? error);
      Alert.alert('Could not save', 'Please try updating your sighting again.');
    } finally {
      setIsSavingSightingEdit(false);
    }
  }, [currentUser?.id, editingSightingNotes, editingSightingTitle, selectedSighting, selectedSightingIsOwned]);

  const handleDeleteSighting = useCallback(() => {
    if (!currentUser?.id || !selectedSighting || !selectedSightingIsOwned) return;

    if (__DEV__) {
      console.log('[Discover] Sighting delete permission check:', {
        sightingId: selectedSighting.id,
        sightingUserId: selectedSighting.user_id ?? null,
        currentUserId: currentUser.id,
        allowed: selectedSightingIsOwned,
      });
    }

    Alert.alert(
      'Delete sighting?',
      'This removes your spotted truck from Discover and the map.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setIsDeletingSighting(true);

            if (__DEV__) {
              console.log('[Discover] Sighting delete attempt:', {
                sightingId: selectedSighting.id,
                userId: currentUser.id,
              });
            }

            try {
              const { error } = await supabase
                .from('sightings')
                .delete()
                .eq('id', selectedSighting.id)
                .eq('user_id', currentUser.id);

              if (__DEV__) {
                console.log('[Discover] Sighting delete Supabase result:', {
                  sightingId: selectedSighting.id,
                  error: error?.message ?? null,
                });
              }

              if (error) throw error;

              setSightings(prev => prev.filter(sighting => sighting.id !== selectedSighting.id));
              setSelectedSighting(null);
              setIsEditingSighting(false);

              if (__DEV__) {
                console.log('[Discover] Sighting delete success:', {
                  sightingId: selectedSighting.id,
                });
              }
            } catch (error: any) {
              console.log('[Discover] Failed to delete sighting:', error?.message ?? error);
              Alert.alert('Could not delete', 'Please try deleting your sighting again.');
            } finally {
              setIsDeletingSighting(false);
            }
          },
        },
      ]
    );
  }, [currentUser?.id, selectedSighting, selectedSightingIsOwned]);

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

      const sightingsWithCoordinates = (data ?? []).filter(hasSightingCoordinates);
      const sightingsWithSpotters = await addSpotterNamesToSightings(supabase, sightingsWithCoordinates);
      if (__DEV__) {
        const submitterIds = new Set(
          sightingsWithCoordinates
            .map((sighting) => sighting.user_id)
            .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
        );
        const mappedSpotterCount = sightingsWithSpotters.filter(sighting => !!sighting.spotted_by_name).length;
        console.log('[Discover] Sighting spotter enrichment:', {
          activeSightingCount: sightingsWithCoordinates.length,
          submitterIdsLoaded: submitterIds.size,
          spottedByMappingCount: mappedSpotterCount,
        });
      }
      setSightings(sightingsWithSpotters);
    } catch (error) {
      console.error('[Discover] Failed to load sightings:', error);
    }
  }, []);

  useEffect(() => {
    void fetchSightings();
  }, [fetchSightings]);

  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (!/inactive|background/.test(previousState) || nextState !== 'active') {
        return;
      }

      const now = Date.now();
      if (
        foregroundRefreshInFlightRef.current ||
        now - lastForegroundRefreshAtRef.current < FOREGROUND_SCREEN_REFRESH_DEBOUNCE_MS
      ) {
        if (__DEV__) {
          console.log('[Discover] Foreground screen refresh skipped');
        }
        return;
      }

      lastForegroundRefreshAtRef.current = now;
      foregroundRefreshInFlightRef.current = true;

      if (__DEV__) {
        console.log('[Discover] Foreground screen refresh started:', {
          previousState,
          nextState,
        });
      }

      void Promise.allSettled([
        fetchSightings(),
        refreshLocationIfGranted(),
      ])
        .then((results) => {
          const rejected = results.filter((result) => result.status === 'rejected');
          if (rejected.length > 0) {
            console.log('[Discover] Foreground screen refresh errors:', rejected);
          }
          if (__DEV__) {
            console.log('[Discover] Foreground screen refresh completed:', {
              errors: rejected.length,
            });
          }
        })
        .catch((error) => {
          console.log('[Discover] Foreground screen refresh error:', error);
        })
        .finally(() => {
          foregroundRefreshInFlightRef.current = false;
        });
    });

    return () => {
      subscription.remove();
    };
  }, [fetchSightings, refreshLocationIfGranted]);

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
  { label: 'Central Illinois', latitude: 40.1164, longitude: -89.1787 },
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
      const { status, coords } = await requestLocationNow();

      if (status === 'unavailable') {
        Alert.alert('Error', 'Unable to get your location');
        return;
      }

      if (status !== 'granted' || !coords) {
        Alert.alert('Permission Denied', 'Please enable location permissions to use this feature');
        return;
      }

      mapRef.current?.animateToRegion({
        latitude: coords.latitude,
        longitude: coords.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 1000);
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

      <ScrollView
        horizontal
        style={styles.filterScroller}
        contentContainerStyle={styles.filterContainer}
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
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
      </ScrollView>

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
            <MapView
              ref={mapRef}
              style={styles.map}
              initialRegion={mapRegion}
              showsUserLocation={Platform.OS !== 'ios'}
              provider={PROVIDER_GOOGLE}
            >
              {mapTrucks.map((truck) => {
                const truckCoordinate = getValidatedCoordinate(`discover truck ${truck.id}`, truck.location);

                if (!truckCoordinate) {
                  return null;
                }

                const truckOpenNow = openTruckIds.has(truck.id);

                return (
                  <Marker
                    key={truck.id}
                    coordinate={truckCoordinate}
                    title={truck.name}
                    description={truckOpenNow ? truck.location?.address || 'Food truck' : 'Not currently serving'}
                    pinColor={truckOpenNow ? OPEN_TRUCK_MARKER_COLOR : CLOSED_TRUCK_MARKER_COLOR}
                    anchor={{ x: 0.5, y: 1 }}
                    onPress={() => handleTruckPress(truck.id)}
                  />
                );
              })}
              {sightings.map((sighting) => {
                const sightingCoordinate = getValidatedCoordinate(`discover sighting ${sighting.id}`, {
                  latitude: sighting.latitude,
                  longitude: sighting.longitude,
                });

                if (!sightingCoordinate) {
                  return null;
                }

                return (
                  <Marker
                    key={`sighting-${sighting.id}`}
                    coordinate={sightingCoordinate}
                    title={sighting.truck_name}
                    description="Recently Spotted"
                    pinColor="#2563eb"
                    onPress={() => handleSightingPress(sighting)}
                  />
                );
              })}
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
        {!hasFeedContent ? (
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

            {sightings.length > 0 && (
              <View style={styles.sightingListSection}>
                {sightings.map((sighting) => (
                  <TouchableOpacity
                    key={`sighting-list-${sighting.id}`}
                    style={styles.sightingListCard}
                    onPress={() => handleSightingPress(sighting)}
                    activeOpacity={0.86}
                  >
                    <View style={styles.sightingListPhotoHalf}>
                      <Image
                        source={sighting.photo_url ? { uri: sighting.photo_url } : undefined}
                        style={styles.sightingListImage}
                        contentFit="cover"
                      />
                    </View>
                    <View style={styles.sightingListInfoHalf}>
                      <View style={styles.sightingListHeaderRow}>
                        <View style={styles.sightingListBadge}>
                          <Text style={styles.sightingListBadgeText}>Recently Spotted</Text>
                        </View>
                        <Text style={styles.sightingListSpotter} numberOfLines={1}>
                          by {getSafeSpotterDisplayName(sighting.spotted_by_name)}
                        </Text>
                      </View>
                      <Text style={styles.sightingListName} numberOfLines={1}>{sighting.truck_name}</Text>
                      <Text style={styles.sightingTimestamp}>{formatSightingLastSeen(sighting.created_at)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {listTrucks.map((truck) => {
              const rating = ratingsByTruckId.get(truck.id);
              const reviewAverage = rating?.count ? Math.round((rating.sum / rating.count) * 10) / 10 : 0;
              const openNow = openTruckIds.has(truck.id);
              const nextStop = getNextUpcomingStopForTruck(truck.id);
              const nextStopLocation = nextStop?.location_text?.trim();
              const currentLocation = openNow ? getTruckDisplayLocation(truck) : null;
              const profileSnippet = (truck.bio || (truck as any).description || '').trim();
              const fallbackLocation = formatCardLocationFallback(truck.location?.address);
              const cardBadges = (truck.trust_badges ?? []).filter(badge =>
                badge === 'veteran_owned' || badge === 'family_owned'
              );

              return (
                <React.Fragment key={truck.id}>
                  <TouchableOpacity
                    style={styles.truckCard}
                    onPress={() => handleTruckPress(truck.id)}
                  >
                    <View style={styles.truckImageColumn}>
                      <Image source={truck.logo ? { uri: truck.logo } : undefined} style={styles.truckLogo} />
                      <View style={styles.imageRatingRow}>
                        <Star
                          size={11}
                          color={rating?.count ? colors.starYellow : colors.secondaryText}
                          fill={rating?.count ? colors.starYellow : 'transparent'}
                        />
                        <Text style={[styles.imageRatingText, !rating?.count && styles.noReviewsText]} numberOfLines={1}>
                          {rating?.count ? `${reviewAverage.toFixed(1)} (${rating.count})` : 'New'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.truckInfo}>
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.truckTitleWrap}>
                          <View style={styles.truckNameRow}>
                            <Text style={styles.truckName} numberOfLines={1}>{truck.name}</Text>
                            {truck.verified && (
                              <CheckCircle size={16} color={colors.success} fill={colors.success} />
                            )}
                            <View style={[styles.statusBadge, openNow && { backgroundColor: `${colors.success}20` }]}>
                              <Text style={[styles.statusText, openNow && { color: colors.success }]}>
                                {openNow ? 'Open' : 'Closed'}
                              </Text>
                            </View>
                          </View>
                          {truck.service_area ? (
                            <Text style={styles.truckServiceArea} numberOfLines={1}>{truck.service_area}</Text>
                          ) : null}
                          {cardBadges.length > 0 ? (
                            <View style={styles.cardBadgeRow}>
                              {cardBadges.slice(0, 2).map(badge => (
                                <Text key={badge} style={styles.cardBadgeText}>
                                  {badge === 'family_owned' ? 'Family Owned' : 'Veteran Owned'}
                                </Text>
                              ))}
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <View style={styles.locationLines}>
                        {currentLocation ? (
                          <Text style={styles.locationLineText} numberOfLines={2} ellipsizeMode="tail">
                            📍 {currentLocation}
                          </Text>
                        ) : nextStop ? (
                          <>
                            <Text style={styles.locationLineText} numberOfLines={1}>
                              📅 {formatCardStopDateTime(nextStop.starts_at)}
                            </Text>
                            {!!nextStopLocation && (
                              <Text style={styles.locationLineText} numberOfLines={2} ellipsizeMode="tail">
                                📍 {nextStopLocation}
                              </Text>
                            )}
                          </>
                        ) : profileSnippet ? (
                          <Text
                            style={[styles.locationLineText, styles.profileSnippetText]}
                            numberOfLines={2}
                            ellipsizeMode="tail"
                          >
                            {profileSnippet}
                          </Text>
                        ) : fallbackLocation ? (
                          <Text style={styles.locationLineText} numberOfLines={1} ellipsizeMode="tail">
                            📍 {fallbackLocation}
                          </Text>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
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
            <View style={styles.sightingPhotoHalf}>
              <Image
                source={selectedSighting?.photo_url ? { uri: selectedSighting.photo_url } : undefined}
                style={styles.sightingImage}
                contentFit="cover"
              />
              <View style={styles.sightingBadge}>
                <Text style={styles.sightingBadgeText}>Recently Spotted</Text>
              </View>
            </View>
            <ScrollView
              style={styles.sightingInfoHalf}
              contentContainerStyle={styles.sightingInfoContent}
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.sightingName} numberOfLines={2}>{selectedSighting?.truck_name}</Text>
              <Text style={styles.sightingTimestamp}>
                {formatSightingLastSeen(selectedSighting?.created_at)}
              </Text>
              <Text style={styles.sightingSpotter}>
                {formatSightingSpotter(selectedSighting)}
              </Text>
              {isEditingSighting ? (
                <>
                  <TextInput
                    style={styles.sightingTitleInput}
                    value={editingSightingTitle}
                    onChangeText={setEditingSightingTitle}
                    placeholder="Truck or sighting name"
                    placeholderTextColor={colors.secondaryText}
                    maxLength={80}
                  />
                  <TextInput
                    style={styles.sightingNotesInput}
                    value={editingSightingNotes}
                    onChangeText={setEditingSightingNotes}
                    placeholder="Update your note..."
                    placeholderTextColor={colors.secondaryText}
                    multiline
                    maxLength={SIGHTING_NOTES_MAX_LENGTH}
                  />
                  <Text style={styles.sightingCharacterCount}>
                    {editingSightingNotes.length}/{SIGHTING_NOTES_MAX_LENGTH}
                  </Text>
                </>
              ) : selectedSighting?.notes ? (
                <Text style={styles.sightingNotes}>{selectedSighting.notes}</Text>
              ) : (
                <Text style={styles.sightingNotesMuted}>Community photo sighting</Text>
              )}
              <View style={styles.sightingLocationCard}>
                <View style={styles.sightingLocationTextWrap}>
                  <MapPin size={16} color={colors.primary} />
                  <Text style={styles.sightingLocationText} numberOfLines={2}>
                    {getSightingLocationText(selectedSighting)}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.sightingNavigateButton}
                  onPress={() => openSightingNavigation(selectedSighting?.latitude, selectedSighting?.longitude)}
                  activeOpacity={0.85}
                >
                  <Navigation size={15} color={colors.background} />
                  <Text style={styles.sightingNavigateButtonText}>Navigate</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.sightingActionsRow}>
                {selectedSightingIsOwned && !isEditingSighting ? (
                  <>
                    <TouchableOpacity
                      style={styles.sightingEditButton}
                      onPress={handleStartEditSighting}
                      disabled={isDeletingSighting}
                    >
                      <Text style={styles.sightingEditButtonText}>Edit</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sightingDeleteButton, isDeletingSighting && styles.sightingButtonDisabled]}
                      onPress={handleDeleteSighting}
                      disabled={isDeletingSighting}
                    >
                      <Text style={styles.sightingDeleteButtonText}>
                        {isDeletingSighting ? 'Deleting...' : 'Delete'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : null}
                {isEditingSighting ? (
                  <>
                    <TouchableOpacity
                      style={styles.sightingEditButton}
                      onPress={() => setIsEditingSighting(false)}
                      disabled={isSavingSightingEdit}
                    >
                      <Text style={styles.sightingEditButtonText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.sightingCloseButton, isSavingSightingEdit && styles.sightingButtonDisabled]}
                      onPress={handleSaveSightingEdit}
                      disabled={isSavingSightingEdit}
                    >
                      <Text style={styles.sightingCloseButtonText}>
                        {isSavingSightingEdit ? 'Saving...' : 'Save'}
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <TouchableOpacity
                    style={styles.sightingCloseButton}
                    onPress={() => setSelectedSighting(null)}
                  >
                    <Text style={styles.sightingCloseButtonText}>Close</Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
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

      <LocationPermissionCard
        visible={showLocationPrompt}
        anim={locationPromptAnim}
        onAllow={handleAllowLocation}
        onDismiss={dismissLocationPromptCard}
      />
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
    marginTop: 2,
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
  filterScroller: {
    flexGrow: 0,
    marginBottom: 6,
  },
  filterContainer: {
    paddingLeft: 20,
    paddingRight: 20,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minHeight: 34,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 18,
    paddingHorizontal: 12,
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
  truckImageColumn: {
    width: 72,
    alignItems: 'center',
    flexShrink: 0,
  },
  imageRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    marginTop: 5,
    maxWidth: 72,
  },
  imageRatingText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: '700' as const,
    color: colors.text,
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
  sightingListSection: {
    marginBottom: 4,
  },
  sightingListCard: {
    flexDirection: 'row',
    height: 92,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 8,
    padding: 7,
    gap: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sightingListPhotoHalf: {
    width: 76,
    height: 76,
    alignSelf: 'center',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
  },
  sightingListImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.cardBackground,
  },
  sightingListInfoHalf: {
    flex: 1,
    justifyContent: 'center',
    minWidth: 0,
    paddingVertical: 1,
  },
  sightingListHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sightingListBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  sightingListBadgeText: {
    fontSize: 10,
    fontWeight: '700' as const,
    color: '#92400E',
  },
  sightingListSpotter: {
    flex: 1,
    fontSize: 10,
    fontWeight: '600' as const,
    color: colors.secondaryText,
  },
  sightingListName: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 4,
  },
  truckInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'flex-start',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 7,
  },
  truckTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  truckNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  truckName: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: '600' as const,
    color: colors.text,
  },
  truckCuisine: {
    fontSize: 14,
    color: colors.secondaryText,
    marginTop: 2,
  },
  truckServiceArea: {
    fontSize: 12,
    color: colors.secondaryText,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 5,
  },
  cardBadgeText: {
    fontSize: 10,
    fontWeight: '800' as const,
    color: colors.primary,
    backgroundColor: `${colors.primary}10`,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 999,
  },
  locationLines: {
    gap: 3,
  },
  locationLineText: {
    fontSize: 14,
    fontWeight: '600' as const,
    lineHeight: 18,
    color: colors.text,
  },
  profileSnippetText: {
    fontWeight: '500' as const,
    color: colors.secondaryText,
  },
  noReviewsText: {
    fontSize: 12,
    color: colors.secondaryText,
  },
  spotListAction: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: colors.primary,
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
    maxHeight: '90%',
    backgroundColor: colors.cardBackground,
    borderRadius: 18,
    padding: 0,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sightingPhotoHalf: {
    width: '100%',
    height: 150,
    backgroundColor: colors.secondaryBackground,
  },
  sightingImage: {
    width: '100%',
    height: '100%',
    backgroundColor: colors.secondaryBackground,
  },
  sightingInfoHalf: {
    padding: 16,
  },
  sightingInfoContent: {
    paddingBottom: 16,
  },
  sightingName: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 10,
  },
  sightingBadge: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    alignSelf: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  sightingBadgeText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: '#92400E',
  },
  sightingTimestamp: {
    fontSize: 13,
    color: colors.secondaryText,
    marginBottom: 6,
  },
  sightingSpotter: {
    fontSize: 12,
    fontWeight: '600' as const,
    color: colors.primary,
    marginBottom: 10,
  },
  sightingNotes: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.text,
    marginBottom: 14,
  },
  sightingNotesMuted: {
    fontSize: 14,
    color: colors.secondaryText,
    marginBottom: 12,
  },
  sightingNotesInput: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 10,
    color: colors.text,
    backgroundColor: colors.secondaryBackground,
    fontSize: 14,
    lineHeight: 20,
    textAlignVertical: 'top',
  },
  sightingTitleInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: colors.text,
    backgroundColor: colors.secondaryBackground,
    fontSize: 15,
    fontWeight: '700' as const,
    marginBottom: 8,
  },
  sightingCharacterCount: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: colors.secondaryText,
    marginTop: 4,
    marginBottom: 10,
  },
  sightingLocationCard: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 10,
    marginBottom: 12,
    gap: 10,
  },
  sightingLocationTextWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  sightingLocationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
    color: colors.text,
  },
  sightingNavigateButton: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 10,
  },
  sightingNavigateButtonText: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: colors.background,
  },
  sightingActionsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  sightingEditButton: {
    flex: 1,
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sightingEditButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.text,
  },
  sightingDeleteButton: {
    flex: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  sightingDeleteButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#EF4444',
  },
  sightingCloseButton: {
    flex: 1,
    backgroundColor: colors.primary,
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 12,
  },
  sightingButtonDisabled: {
    opacity: 0.65,
  },
  sightingCloseButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.background,
  },
});
