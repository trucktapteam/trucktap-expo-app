import React, { useMemo, useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Linking, TextInput, Modal, Alert, Platform, Animated, Share, KeyboardAvoidingView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import * as Location from 'expo-location';
import { MapPin, Clock, Star, MessageSquare, Navigation, ChevronRight, CheckCircle, Shield, Phone, X, Utensils, Pencil } from 'lucide-react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { useApp, useTruckReviews, useTruckRating } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { Image } from 'expo-image';
import FullImageModal from '@/components/FullImageModal';
import TruckHero from '@/components/TruckHero';
import TruckSectionCard from '@/components/TruckSectionCard';
import ReviewerAvatar from '@/components/ReviewerAvatar';
import ExpandableText from '@/components/ExpandableText';
import AuthPromptModal from '@/components/AuthPromptModal';
import UpcomingStopsRow from '@/components/UpcomingStopsRow';
import { trackEvent } from '@/lib/analytics';
import { getTruckShareUrl } from '@/lib/truckShare';
import { recordReviewEngagement } from '@/lib/appReviewPrompt';
import {
  fetchCurrentUserTruckCheckInCount,
  hasCurrentUserCheckedInToday,
  insertCurrentUserTruckCheckIn,
} from '@/lib/truckCheckins';
import { MenuItem } from '@/types';

const CHECK_IN_RADIUS_FEET = 1320;
const FEET_PER_METER = 3.28084;
const EARTH_RADIUS_METERS = 6371000;

const getDistanceInFeet = (
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number }
) => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = toRadians(end.latitude - start.latitude);
  const longitudeDelta = toRadians(end.longitude - start.longitude);
  const startLatitude = toRadians(start.latitude);
  const endLatitude = toRadians(end.latitude);

  const a =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2) +
    Math.cos(startLatitude) *
      Math.cos(endLatitude) *
      Math.sin(longitudeDelta / 2) *
      Math.sin(longitudeDelta / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c * FEET_PER_METER;
};

interface TruckProfileProps {
  truckId: string;
  mode: 'customer' | 'owner';
  onBack?: () => void;
}

export default function TruckProfile({ truckId, mode, onBack }: TruckProfileProps) {
  const router = useRouter();
  const { foodTrucks, currentUser, toggleFavorite, addReview, isTruckOpenNow, incrementView, incrementNavigation, incrementMenuView, incrementPhotoView, getAnnouncements, getUpcomingStops, isProfileComplete, getTruckActivityStatus, menuItems, formatOperatingHours, allTrucksLoading, isOwnerLoading } = useApp();
  const { colors } = useTheme();
  const { isAuthenticated, user: authUser, isLoading: authLoading } = useAuth();
  
  const truck = useMemo(() => 
    foodTrucks.find(t => t.id === truckId),
    [foodTrucks, truckId]
  );
  const truckOpenNow = useMemo(
    () => !!truck && isTruckOpenNow(truck.id),
    [truck, isTruckOpenNow]
  );
  const activityStatus = useMemo(
    () => getTruckActivityStatus(truck),
    [getTruckActivityStatus, truck]
  );

  const isOwnerOfTruck = useMemo(() => {
    if (!isAuthenticated || !authUser || !truck) return false;
    return truck.owner_id === authUser.id;
  }, [isAuthenticated, authUser, truck]);
  const isCustomerReviewPromptAudience =
    mode === 'customer' && currentUser?.role !== 'truck' && currentUser?.role !== 'admin';
  const canViewTestTruck = currentUser?.role === 'admin' || isOwnerOfTruck;
  const canViewArchivedTruck = currentUser?.role === 'admin' || isOwnerOfTruck;
  
  const reviews = useTruckReviews(truckId);
  const { average, count } = useTruckRating(truckId);
  
  const truckMenuItems = useMemo(() => 
    menuItems.filter(item => item.truck_id === truckId && item.available),
    [menuItems, truckId]
  );
  
  const isFavorite = useMemo(() => 
    mode === 'customer' && currentUser?.favorites.includes(truckId) || false,
    [currentUser, truckId, mode]
  );
  const hasNavigableLocation = useMemo(
    () => Number.isFinite(truck?.location?.latitude) && Number.isFinite(truck?.location?.longitude),
    [truck]
  );

  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [reviewRating, setReviewRating] = useState<number>(5);
  const [reviewComment, setReviewComment] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [showAuthPrompt, setShowAuthPrompt] = useState<boolean>(false);
  const [authAction, setAuthAction] = useState<string>('');
  const [selectedMenuItem, setSelectedMenuItem] = useState<MenuItem | null>(null);
  const [showMenuItemModal, setShowMenuItemModal] = useState<boolean>(false);
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [checkInCount, setCheckInCount] = useState<number>(0);
  const [checkedInToday, setCheckedInToday] = useState<boolean>(false);
  const [checkInLoading, setCheckInLoading] = useState<boolean>(false);
  const [checkInSubmitting, setCheckInSubmitting] = useState<boolean>(false);
  
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollY = useRef(new Animated.Value(0)).current;
  const trackedProfileViewTruckIdRef = useRef<string | null>(null);

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();

    if (truckId && mode === 'customer') {
      incrementView(truckId);
    }
  }, [fadeAnim, truckId, incrementView, mode]);

  React.useEffect(() => {
    if (!truckId || mode !== 'customer' || trackedProfileViewTruckIdRef.current === truckId) {
      return;
    }

    trackedProfileViewTruckIdRef.current = truckId;
    void trackEvent({
      event_type: 'truck_profile_view',
      truck_id: truckId,
      user_id: authUser?.id ?? currentUser?.id ?? null,
    });
    if (isCustomerReviewPromptAudience) {
      void recordReviewEngagement('truck_profile_view', {
        truckId,
        userId: authUser?.id ?? currentUser?.id ?? null,
      });
    }
  }, [authUser?.id, currentUser?.id, isCustomerReviewPromptAudience, mode, truckId]);

  const refreshCheckInState = useCallback(async () => {
    if (mode !== 'customer' || !truck || !isAuthenticated || !authUser) {
      setCheckInCount(0);
      setCheckedInToday(false);
      setCheckInLoading(false);
      return;
    }

    setCheckInLoading(true);
    try {
      const [visitCount, hasCheckedInToday] = await Promise.all([
        fetchCurrentUserTruckCheckInCount(truck.id, authUser.id),
        hasCurrentUserCheckedInToday(truck.id, authUser.id),
      ]);

      setCheckInCount(visitCount);
      setCheckedInToday(hasCheckedInToday);
    } catch (error) {
      console.error('[TruckProfile] Failed to load check-in state:', error);
    } finally {
      setCheckInLoading(false);
    }
  }, [authUser, isAuthenticated, mode, truck]);

  React.useEffect(() => {
    void refreshCheckInState();
  }, [refreshCheckInState]);

  const handleOwnerAction = useCallback((action: string) => {
    if (!isAuthenticated || !authUser) {
      Alert.alert('Owner Access Required', 'You must be logged in as the truck owner to perform this action.');
      return;
    }
    if (!isOwnerOfTruck) {
      Alert.alert('Owner Access Required', 'Only the truck owner can perform this action.');
      return;
    }
    switch (action) {
      case 'edit':
        console.log('[TruckProfile] Navigating to owner dashboard: /(truck)/(tabs)/dashboard');
        router.push('/(truck)/(tabs)/dashboard' as any);
        break;
      case 'menu':
        router.push('/(truck)/menu-editor' as any);
        break;
      case 'hours':
        router.push('/(truck)/operating-hours' as any);
        break;
      case 'gallery':
        router.push('/(truck)/gallery' as any);
        break;
      case 'announcements':
        router.push('/(truck)/announcements' as any);
        break;
      default:
        break;
    }
  }, [isAuthenticated, authUser, isOwnerOfTruck, router]);

  const isWaitingForTruck = !truck && (allTrucksLoading || authLoading || isOwnerLoading);
  const isWaitingForVisibility =
    !!truck &&
    mode === 'customer' &&
    (authLoading || isOwnerLoading) &&
    ((truck.is_test === true && !canViewTestTruck) ||
      ((truck.archived === true || !!truck.archivedAt) && !canViewArchivedTruck));

  if (isWaitingForTruck || isWaitingForVisibility) {
    const styles = createStyles(colors);
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (
    !truck ||
    (mode === 'customer' && truck.is_test === true && !canViewTestTruck) ||
    (mode === 'customer' && (truck.archived === true || !!truck.archivedAt) && !canViewArchivedTruck)
  ) {
    const styles = createStyles(colors);
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Truck not found</Text>
      </View>
    );
  }

  const hasValidPhone = !!truck.phone && truck.phone.length === 10;
  const isClosedCustomerView = mode === 'customer' && !truckOpenNow;
  const customerLocationText = isClosedCustomerView
    ? 'Not currently serving'
    : truck.location.address || 'Serving location not set';

  const handleNavigate = () => {
    if (isClosedCustomerView) {
      Alert.alert('Not currently serving', 'This truck is not currently sharing a live serving location.');
      return;
    }

    if (!hasNavigableLocation) {
      Alert.alert('Location unavailable', 'This truck has not set a live serving location yet.');
      return;
    }
    incrementNavigation(truck.id);
    void trackEvent({
      event_type: 'navigate_click',
      truck_id: truck.id,
      user_id: authUser?.id ?? currentUser?.id ?? null,
    });
    if (isCustomerReviewPromptAudience) {
      void recordReviewEngagement('navigate_click', {
        truckId: truck.id,
        userId: authUser?.id ?? currentUser?.id ?? null,
      });
    }
    const { latitude, longitude } = truck.location;
    const url = Platform.select({
      ios: `http://maps.apple.com/?daddr=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });
    
    Linking.openURL(url).catch((err) => {
      console.error('Failed to open maps:', err);
      Alert.alert('Error', 'Unable to open maps');
    });
  };

  const handleCall = () => {
    if (!hasValidPhone) return;
    const phoneUrl = `tel:${truck.phone}`;
    Linking.openURL(phoneUrl).catch((err) => {
      console.error('Failed to open phone:', err);
      Alert.alert('Error', 'Unable to make call');
    });
  };

  const handleShare = async () => {
    try {
      void trackEvent({
        event_type: 'share_click',
        truck_id: truck.id,
        user_id: authUser?.id ?? currentUser?.id ?? null,
      });
      await Share.share({
        message: `Check out ${truck.name} on TruckTap! ${getTruckShareUrl(truck.id)}`,
        title: truck.name,
      });
    } catch (error) {
      console.error('Error sharing:', error);
    }
  };

  const handleToggleFavorite = () => {
    if (mode === 'customer') {
      if (authLoading) {
        console.log('[TruckProfile] Auth still loading, ignoring favorite action');
        return;
      }
      if (!isAuthenticated || !authUser) {
        setAuthAction('favorite this truck');
        setShowAuthPrompt(true);
        return;
      }
      toggleFavorite(truck.id);
    }
  };

  const getCheckInButtonLabel = () => {
    if (authLoading) return 'Loading...';
    if (!isAuthenticated || !authUser) return 'Sign In to Check In';
    if (!truckOpenNow) return 'Check In When Truck Is Live';
    if (checkedInToday) return 'Checked In Today ✓';
    return 'Check In';
  };

  const handleCheckIn = async () => {
    if (authLoading || checkInSubmitting) return;

    if (!isAuthenticated || !authUser) {
      setAuthAction('check in');
      setShowAuthPrompt(true);
      return;
    }

    if (!truckOpenNow) {
      Alert.alert('Truck must be LIVE', 'You can check in when this truck is live and serving.');
      return;
    }

    if (!hasNavigableLocation) {
      Alert.alert('Location unavailable', 'This truck does not have a check-in location yet.');
      return;
    }

    if (checkedInToday) return;

    setCheckInSubmitting(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        Alert.alert('Location required', 'Location access is required to check in.');
        return;
      }

      let userLocation: Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>;
      try {
        userLocation = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
      } catch (locationError) {
        console.log('[TruckProfile] Failed to get check-in location:', locationError);
        Alert.alert('Location required', 'Location access is required to check in.');
        return;
      }

      const distanceFeet = getDistanceInFeet(
        {
          latitude: userLocation.coords.latitude,
          longitude: userLocation.coords.longitude,
        },
        {
          latitude: truck.location.latitude,
          longitude: truck.location.longitude,
        }
      );

      if (distanceFeet > CHECK_IN_RADIUS_FEET) {
        Alert.alert('Too far away', 'You must be near the truck to check in.');
        return;
      }

      await insertCurrentUserTruckCheckIn(truck.id, authUser.id);
      const updatedCount = await fetchCurrentUserTruckCheckInCount(truck.id, authUser.id);

      setCheckInCount(updatedCount);
      setCheckedInToday(true);
      Alert.alert('Checked in!', `This is visit #${updatedCount} for ${truck.name}.`);
    } catch (error: any) {
      if (error?.code === '23505') {
        setCheckedInToday(true);
        await refreshCheckInState();
        Alert.alert('Already checked in today', 'You can check in again tomorrow.');
      } else {
        console.error('[TruckProfile] Failed to check in:', error);
        Alert.alert('Check-in failed', 'Could not check in right now. Please try again.');
      }
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const formatTimestamp = (dateInput?: string | Date) => {
  if (!dateInput) return 'Just now';
console.log('[FORMAT DATE]', dateInput);
  const date =
    typeof dateInput === 'string'
      ? new Date(dateInput)
      : dateInput;

  if (!date || isNaN(date.getTime())) return 'Just now';

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

  const handleOpenReviewModal = () => {
    if (authLoading) {
      console.log('[TruckProfile] Auth still loading, ignoring review action');
      
      return;
    }
    if (!isAuthenticated || !authUser) {
      setAuthAction('leave a review');
      setShowAuthPrompt(true);
      return;
    }
    setShowReviewModal(true);
  };

  const handleSubmitReview = async () => {
    if (authLoading) {
      console.log('[TruckProfile] Auth still loading, ignoring review submission');
      return;
    }
    if (!isAuthenticated || !authUser) {
      setShowReviewModal(false);
      setAuthAction('leave a review');
      setShowAuthPrompt(true);
      return;
    }

    if (!reviewComment.trim()) {
      Alert.alert('Error', 'Please write a comment');
      return;
    }
    
   try {
  await addReview(truck.id, reviewRating, reviewComment);

  setShowReviewModal(false);
  setReviewRating(5);
  setReviewComment('');
  Alert.alert('Success', 'Review submitted successfully!');
} catch (error) {
  console.error('[TruckProfile] Failed to submit review:', error);
  Alert.alert('Error', 'Could not submit review. Please try again.');
}
  };

  const renderStars = (rating: number, size: number = 16, interactive: boolean = false, onPress?: (rating: number) => void) => {
    return (
      <View style={styles.starsContainer}>
        {[1, 2, 3, 4, 5].map((star) => (
          <TouchableOpacity
            key={star}
            disabled={!interactive}
            onPress={() => interactive && onPress && onPress(star)}
          >
            <Star
              size={size}
              color={star <= rating ? colors.starYellow : colors.border}
              fill={star <= rating ? colors.starYellow : 'transparent'}
            />
          </TouchableOpacity>
        ))}
      </View>
    );
  };

  const styles = createStyles(colors);
  const checkInVisitText =
    isAuthenticated && authUser && checkInLoading
      ? 'Loading visits...'
      : checkInCount === 0
        ? 'First visit'
        : checkInCount === 1
          ? "You've visited 1 time"
          : `You've visited ${checkInCount} times`;
  const truckAnnouncements = getAnnouncements(truck.id);

  return (
    <View style={styles.container}>
      <Animated.ScrollView 
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
      >
        <TruckHero
          heroImage={truck.hero_image}
          logo={truck.logo}
          isFavorite={isFavorite}
          onBack={onBack || (() => router.back())}
          onToggleFavorite={mode === 'customer' ? handleToggleFavorite : undefined}
          onShare={mode === 'customer' ? handleShare : undefined}
          onEdit={isOwnerOfTruck ? () => handleOwnerAction('edit') : undefined}
        />

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.headerInfo}>
            <View style={styles.titleInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.truckName}>{truck.name}</Text>
                
                {truck.verified && isProfileComplete(truck.id) && (
                  <View style={styles.verifiedBadge}>
                    <CheckCircle size={16} color={colors.success} fill={colors.success} />
                  </View>
                )}
              </View>
              <Text style={styles.cuisine}>{truck.cuisine_type}</Text>
              <View style={styles.trustRow}>
                {truck.verified && isProfileComplete(truck.id) ? (
                  <View style={styles.trustIndicator}>
                    <Shield size={14} color={colors.secondaryText} />
                    <Text style={styles.trustText}>Verified on TruckTap</Text>
                  </View>
                ) : (
                  <Text style={styles.incompleteText}>🍴Preparing🍴</Text>
                )}
                {activityStatus.lastActivityLabel ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.trustDot}>•</Text>
                    <Text style={styles.trustText}>{activityStatus.lastActivityLabel}</Text>
                  </View>
                ) : null}
              </View>
              {activityStatus.activeOnTruckTap && (
                <View style={styles.activityBadge}>
                  <Text style={styles.activityBadgeText}>🟢 Active on TruckTap</Text>
                </View>
              )}
              {count > 0 && (
                <View style={styles.ratingRow}>
                  {renderStars(average, 18)}
                  <Text style={styles.ratingText}>
                    {average.toFixed(1)} ({count} {count === 1 ? 'review' : 'reviews'})
                  </Text>
                </View>
              )}
            </View>
            <View style={[styles.statusBadge, isTruckOpenNow(truck.id) && styles.statusBadgeOpen]}>
              <Text style={[styles.statusText, isTruckOpenNow(truck.id) && styles.statusTextOpen]}>
                {isTruckOpenNow(truck.id) ? 'Open Now' : 'Closed'}
              </Text>
            </View>
          </View>

          {isOwnerOfTruck && (
            <TouchableOpacity
              style={styles.ownerEditBanner}
              onPress={() => handleOwnerAction('edit')}
              activeOpacity={0.7}
            >
              <Pencil size={16} color={colors.background} />
              <Text style={styles.ownerEditBannerText}>Edit Truck Profile</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionButtons}>
            <TouchableOpacity 
              style={[styles.navigateButton, !hasNavigableLocation && styles.navigateButtonDisabled]} 
              onPress={handleNavigate}
              disabled={!hasNavigableLocation}
              activeOpacity={0.7}
            >
              <Navigation size={20} color={colors.background} />
              <Text style={styles.navigateButtonText}>
                {hasNavigableLocation ? 'Navigate' : 'Location Unavailable'}
              </Text>
            </TouchableOpacity>
            
            {mode === 'customer' && hasValidPhone && (
              <TouchableOpacity 
                style={styles.callButton} 
                onPress={handleCall}
                activeOpacity={0.7}
              >
                <Phone size={20} color={colors.primary} />
                <Text style={styles.callButtonText}>Call</Text>
              </TouchableOpacity>
            )}
            
            {mode === 'customer' && (
              <TouchableOpacity 
                style={styles.reviewButton} 
                onPress={handleOpenReviewModal}
                activeOpacity={0.7}
              >
                <MessageSquare size={20} color={colors.primary} />
                <Text style={styles.reviewButtonText}>Review</Text>
              </TouchableOpacity>
            )}
          </View>

          <TruckSectionCard title="About">
            <View style={styles.aboutContent}>
              <View style={styles.infoRow}>
                <MapPin size={20} color={colors.secondaryText} />
                <Text style={styles.infoText}>{customerLocationText}</Text>
              </View>
              <View style={styles.infoRow}>
                <Clock size={20} color={colors.secondaryText} />
                <Text style={styles.infoText}>{formatOperatingHours(truck.id)}</Text>
              </View>
              <View style={styles.bioDivider} />
              <ExpandableText text={truck.bio} numberOfLines={3} style={styles.bioText} />
            </View>
          </TruckSectionCard>

          <TruckSectionCard>
            <View style={styles.sectionHeaderRow}>
              <Text style={{ color: '#111111', fontSize: 20, fontWeight: '700' }}>Gallery</Text>
              <TouchableOpacity
                style={styles.seeAllButton}
                onPress={() => router.push(`/truck/gallery?id=${truck.id}` as any)}
                activeOpacity={0.7}
              >
                <Text style={styles.seeAllText}>See All</Text>
                <ChevronRight size={16} color={colors.primary} />
              </TouchableOpacity>
            </View>
            {truck.images.length > 0 ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.galleryScrollContent}
              >
                {truck.images.slice(0, 6).map((imageUrl, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[styles.galleryImageContainer, index === 0 && styles.firstGalleryImage]}
                    onPress={() => setSelectedImage(imageUrl)}
                    activeOpacity={0.7}
                  >
                    <Image source={{ uri: imageUrl }} style={styles.galleryImage} contentFit="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            ) : (
              <View style={styles.emptyGalleryState}>
                <Text style={styles.emptyGalleryText}>No gallery images yet</Text>
              </View>
            )}
          </TruckSectionCard>

          {truckMenuItems.length > 0 && (
            <TruckSectionCard>
              <View style={styles.sectionHeaderRow}>
               <Text style={{ color: '#111111', fontSize: 20, fontWeight: '700' }}>Menu</Text>
                <TouchableOpacity
                  style={styles.seeAllButton}
                  onPress={() => router.push(`/truck/menu?id=${truck.id}` as any)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.seeAllText}>See All</Text>
                  <ChevronRight size={16} color={colors.primary} />
                </TouchableOpacity>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.menuScrollContent}
                onScrollBeginDrag={() => incrementMenuView(truck.id)}
              >
                {truckMenuItems.slice(0, 6).map((item, index) => (
                  <TouchableOpacity
                    key={item.id}
                    style={[styles.menuItemCard, index === 0 && styles.firstMenuItem]}
                    onPress={() => {
                      setSelectedMenuItem(item);
                      setShowMenuItemModal(true);
                    }}
                    activeOpacity={0.7}
                  >
                    {item.image ? (
                      <Image source={{ uri: item.image }} style={styles.menuItemImage} contentFit="cover" />
                    ) : (
                      <View style={styles.menuItemImagePlaceholder}>
                        <Utensils size={32} color={colors.secondaryText} />
                      </View>
                    )}
                    <View style={styles.menuItemInfo}>
                      <Text style={styles.menuItemName} numberOfLines={2}>{item.name}</Text>
                      <Text style={styles.menuItemPrice}>${item.price.toFixed(2)}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </TruckSectionCard>
          )}

          <UpcomingStopsRow stops={getUpcomingStops(truck.id)} />

          {mode === 'customer' && (
            <View style={styles.checkInInlineSection}>
              <View style={styles.checkInTextBlock}>
                <View style={styles.checkInTitleRow}>
                  <MapPin size={14} color={colors.primary} />
                  <Text style={styles.checkInTitle} numberOfLines={1}>
                    {checkedInToday ? 'Checked In Today ✓' : 'Check In'}
                  </Text>
                </View>
                <Text style={styles.checkInCountValue} numberOfLines={1}>
                  {checkInVisitText}
                </Text>
              </View>

              {checkedInToday ? (
                <View style={styles.checkInStatusPill}>
                  <CheckCircle size={13} color={colors.success} />
                  <Text style={styles.checkInStatusText} numberOfLines={1}>
                    Checked In
                  </Text>
                </View>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.checkInButton,
                    (authLoading ||
                      checkInLoading ||
                      checkInSubmitting ||
                      (isAuthenticated && !!authUser && !truckOpenNow)) &&
                      styles.checkInButtonDisabled,
                  ]}
                  onPress={handleCheckIn}
                  disabled={
                    authLoading ||
                    checkInLoading ||
                    checkInSubmitting ||
                    (isAuthenticated && !!authUser && !truckOpenNow)
                  }
                  activeOpacity={0.75}
                >
                  {checkInSubmitting ? (
                    <ActivityIndicator size="small" color={colors.background} />
                  ) : (
                    <Text style={styles.checkInButtonText} numberOfLines={1} adjustsFontSizeToFit>
                      {getCheckInButtonLabel()}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}

          {truckAnnouncements.length > 0 && (
            <TruckSectionCard>
              <View style={styles.sectionHeaderRow}>
                <Text style={{ color: '#111111', fontSize: 20, fontWeight: '700' }}>Announcements</Text>
                {truckAnnouncements.length > 3 && (
                  <TouchableOpacity
                    style={styles.seeAllButton}
                    onPress={() => router.push('/(truck)/announcements' as any)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.seeAllText}>See All</Text>
                    <ChevronRight size={16} color={colors.primary} />
                  </TouchableOpacity>
                )}
              </View>
              {truckAnnouncements.slice(0, 3).map(announcement => (
                <View key={announcement.id} style={styles.announcementCard}>
                  <View style={styles.announcementHeader}>
                    <View style={styles.announcementIcon}>
                      <MessageSquare size={18} color={colors.primary} />
                    </View>
                    <Text style={styles.announcementTime}>{formatTimestamp(announcement.timestamp)}</Text>
                  </View>
                  <Text style={styles.announcementText}>
                    {announcement.message}
                  </Text>
                </View>
              ))}
            </TruckSectionCard>
          )}

          <TruckSectionCard>
        <View style={styles.sectionHeaderRow}>
  <Text style={{ color: '#111111', fontSize: 20, fontWeight: '700' }}>
    Reviews
  </Text>

  {count > 0 && (
    <Text style={{ color: colors.primary, fontWeight: '600' }}>
      ⭐ {average.toFixed(1)} ({count})
    </Text>
  )}

  {reviews.length > 2 && (
    <TouchableOpacity
      style={styles.seeAllButton}
      onPress={() => setShowAllReviewsModal(true)}
    >
      <Text style={styles.seeAllText}>See All</Text>
      <ChevronRight size={16} color={colors.primary} />
    </TouchableOpacity>
  )}
</View>

  {reviews.length > 0 ? (
    reviews.slice(0, 2).map(review => (
      <View key={review.id} style={styles.reviewCard}>
        <View style={styles.reviewHeader}>
          <ReviewerAvatar
  name={review.user.name}
  photo={review.user.profile_photo}
  size={44}
/>
          <View style={styles.reviewUserInfo}>
            <Text style={styles.reviewUserName}>{review.user.name}</Text>
            {renderStars(review.rating, 14)}
          </View>
          <Text style={styles.reviewTime}>{formatTimestamp(review.createdAt)}</Text>
        </View>
        <ExpandableText text={review.text} numberOfLines={3} style={styles.reviewComment} />
        {review.ownerReply && (
          <View style={styles.ownerReplyCard}>
            <Text style={styles.ownerReplyLabel}>Owner response</Text>
            <ExpandableText
              text={review.ownerReply.body}
              numberOfLines={3}
              style={styles.ownerReplyText}
            />
          </View>
        )}
      </View>
    ))
  ) : (
    <View style={styles.emptyReviewState}>
  <Text style={{ fontSize: 40, marginBottom: 6 }}>⭐⭐⭐⭐⭐</Text>
  <Text style={styles.emptyReviewText}>
    Be the first to review this truck!
  </Text>
</View>
  )}
</TruckSectionCard>
           
          
        </Animated.View>
      </Animated.ScrollView>

      <FullImageModal
        visible={selectedImage !== null}
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
        onPhotoView={() => incrementPhotoView(truck.id)}
      />

      <AuthPromptModal
        visible={showAuthPrompt}
        onClose={() => setShowAuthPrompt(false)}
        action={authAction}
        returnRoute={`/(customer)/truck/${truckId}`}
      />
      
      <Modal
  visible={showAllReviewsModal}
  animationType="slide"
  transparent={true}
  onRequestClose={() => setShowAllReviewsModal(false)}
>
  <View style={styles.modalOverlay}>
    <View style={styles.modalContent}>
      
      <View style={styles.modalHeader}>
        <Text style={styles.modalTitle}>All Reviews</Text>

        <TouchableOpacity onPress={() => setShowAllReviewsModal(false)}>
          <Text style={styles.modalClose}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {reviews.map(review => (
          <View key={review.id} style={styles.reviewCard}>
            <View style={styles.reviewHeader}>
              <ReviewerAvatar
                name={review.user.name}
                photo={review.user.profile_photo}
                size={44}
              />

              <View style={styles.reviewUserInfo}>
                <Text style={styles.reviewUserName}>{review.user.name}</Text>
                {renderStars(review.rating, 14)}
              </View>

              <Text style={styles.reviewTime}>
                {formatTimestamp(review.createdAt)}
              </Text>
            </View>

            <ExpandableText
              text={review.text}
              numberOfLines={6}
              style={styles.reviewComment}
            />
            {review.ownerReply && (
              <View style={styles.ownerReplyCard}>
                <Text style={styles.ownerReplyLabel}>Owner response</Text>
                <ExpandableText
                  text={review.ownerReply.body}
                  numberOfLines={6}
                  style={styles.ownerReplyText}
                />
              </View>
            )}
          </View>
        ))}
      </ScrollView>

    </View>
  </View>
</Modal>

      {mode === 'customer' && (
        <>
          <Modal
            visible={showReviewModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowReviewModal(false)}
          >
            <KeyboardAvoidingView 
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalOverlay}
            >
              <TouchableOpacity 
                activeOpacity={1} 
                style={styles.modalOverlay}
                onPress={() => setShowReviewModal(false)}
              >
                <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={(e) => e.stopPropagation()}>
                  <ScrollView showsVerticalScrollIndicator={false}>
                    <View style={styles.modalHeader}>
                      <Text style={styles.modalTitle}>Write a Review</Text>
                      <TouchableOpacity onPress={() => setShowReviewModal(false)}>
                        <Text style={styles.modalClose}>✕</Text>
                      </TouchableOpacity>
                    </View>
                    
                    <Text style={styles.ratingLabel}>Your Rating</Text>
                    {renderStars(reviewRating, 32, true, setReviewRating)}
                    
                    <Text style={styles.commentLabel}>Your Review</Text>
                    <TextInput
                      style={styles.commentInput}
                      placeholder="Share your experience..."
                      placeholderTextColor={colors.secondaryText}
                      multiline
                      numberOfLines={4}
                      value={reviewComment}
                      onChangeText={setReviewComment}
                      textAlignVertical="top"
                    />
                    
                    <TouchableOpacity style={styles.submitButton} onPress={handleSubmitReview}>
                      <Text style={styles.submitButtonText}>Submit Review</Text>
                    </TouchableOpacity>
                  </ScrollView>
                </TouchableOpacity>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </Modal>

          <Modal
            visible={showMenuItemModal}
            animationType="slide"
            transparent={true}
            onRequestClose={() => setShowMenuItemModal(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.menuItemModalContent}>
                <TouchableOpacity 
                  style={styles.menuItemModalClose}
                  onPress={() => setShowMenuItemModal(false)}
                >
                  <X size={24} color={colors.text} />
                </TouchableOpacity>
                
                {selectedMenuItem && (
                  <ScrollView showsVerticalScrollIndicator={false}>
                    {selectedMenuItem.image ? (
                      <Image 
                        source={{ uri: selectedMenuItem.image }} 
                        style={styles.menuItemModalImage} 
                        contentFit="contain"
                      />
                    ) : (
                      <View style={styles.menuItemModalImagePlaceholder}>
                        <Utensils size={64} color={colors.secondaryText} />
                      </View>
                    )}
                    
                    <View style={styles.menuItemModalInfo}>
                      <Text style={styles.menuItemModalName}>{selectedMenuItem.name}</Text>
                      <Text style={styles.menuItemModalPrice}>${selectedMenuItem.price.toFixed(2)}</Text>
                      {selectedMenuItem.description ? (
                        <Text style={styles.menuItemModalDescription}>{selectedMenuItem.description}</Text>
                      ) : null}
                    </View>
                  </ScrollView>
                )}
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.secondaryBackground,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.secondaryBackground,
  },
  errorText: {
    fontSize: 16,
    color: colors.secondaryText,
    textAlign: 'center',
    marginTop: 100,
  },
 emptyReviewState: {
  alignItems: 'center',
  justifyContent: 'center',
  paddingVertical: 32,
},

emptyReviewText: {
  marginTop: 8,
  fontSize: 16,
  color: colors.secondaryText,
},
  content: {
    paddingTop: 60,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  titleInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  truckName: {
    fontSize: 32,
    fontWeight: '800' as const,
    color: colors.text,
    letterSpacing: -0.5,
  },
  verifiedBadge: {
    marginTop: 2,
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 6,
    flexWrap: 'wrap',
  },
  trustIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  trustText: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '500' as const,
  },
  trustDot: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '500' as const,
  },
  incompleteText: {
    fontSize: 13,
    color: colors.secondaryText,
    fontStyle: 'italic' as const,
  },
  activityBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${colors.success}12`,
    borderWidth: 1,
    borderColor: `${colors.success}30`,
  },
  activityBadgeText: {
    fontSize: 13,
    color: colors.success,
    fontWeight: '700' as const,
  },
  cuisine: {
    fontSize: 17,
    color: colors.secondaryText,
    fontWeight: '500' as const,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: colors.secondaryBackground,
  },
  statusBadgeOpen: {
    backgroundColor: `${colors.success}20`,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: colors.secondaryText,
  },
  statusTextOpen: {
    color: colors.success,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  navigateButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  navigateButtonDisabled: {
    opacity: 0.5,
  },
  navigateButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.background,
  },
  callButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.cardBackground,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  callButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  reviewButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.cardBackground,
    borderWidth: 2,
    borderColor: colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  reviewButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  checkInInlineSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 2,
    marginBottom: 16,
    paddingHorizontal: 2,
    paddingVertical: 4,
  },
  checkInTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  checkInTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  checkInTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: colors.text,
  },
  checkInStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${colors.success}16`,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  checkInStatusText: {
    fontSize: 12,
    color: colors.success,
    fontWeight: '700' as const,
  },
  checkInCountValue: {
    fontSize: 13,
    color: colors.secondaryText,
    fontWeight: '600' as const,
  },
  checkInButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 34,
    minWidth: 92,
  },
  checkInButtonDisabled: {
    opacity: 0.55,
  },
  checkInButtonText: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: colors.background,
  },
  seeAllRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginBottom: 12,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  seeAllText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.primary,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  bioText: {
    fontSize: 16,
    color: colors.secondaryText,
    lineHeight: 24,
  },
  bioDivider: {
    height: 1,
    backgroundColor: colors.secondaryBackground,
    marginVertical: 16,
  },
  aboutContent: {
    paddingTop: 4,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    color: colors.secondaryText,
    lineHeight: 20,
  },
  menuScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  menuImageWrapper: {
    width: 240,
    height: 180,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  firstMenuItem: {
    marginLeft: 0,
  },
  menuImage: {
    width: '100%',
    height: '100%',
  },
  starsContainer: {
    flexDirection: 'row',
    gap: 4,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  ratingText: {
    fontSize: 15,
    color: colors.secondaryText,
    fontWeight: '600' as const,
  },
  reviewCard: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  reviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  reviewUserInfo: {
    flex: 1,
    gap: 4,
  },
  reviewUserName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
  },
  reviewTime: {
    fontSize: 13,
    color: colors.secondaryText,
  },
  reviewComment: {
    fontSize: 15,
    color: colors.secondaryText,
    lineHeight: 22,
  },
  ownerReplyCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 10,
    backgroundColor: colors.cardBackground,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  ownerReplyLabel: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: colors.primary,
    marginBottom: 6,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.4,
  },
  ownerReplyText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: colors.cardBackground,
    maxHeight: '85%',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.text,
  },
  modalClose: {
    fontSize: 24,
    color: colors.secondaryText,
    fontWeight: '300' as const,
  },
  ratingLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 12,
  },
  commentLabel: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.text,
    marginTop: 20,
    marginBottom: 12,
  },
  commentInput: {
    backgroundColor: colors.secondaryBackground,
    borderRadius: 12,
    padding: 16,
    fontSize: 15,
    color: colors.text,
    minHeight: 120,
    marginBottom: 20,
  },
  submitButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: colors.background,
  },
  galleryScrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  galleryImageContainer: {
    width: 160,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.cardBackground,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  firstGalleryImage: {
    marginLeft: 0,
  },
  galleryImage: {
    width: '100%',
    height: '100%',
  },
  emptyGalleryState: {
    paddingHorizontal: 16,
    paddingVertical: 32,
    alignItems: 'center',
  },
  emptyGalleryText: {
    fontSize: 16,
    color: colors.secondaryText,
    textAlign: 'center',
  },
  announcementCard: {
    backgroundColor: `${colors.primary}12`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  announcementHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  announcementIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: `${colors.primary}20`,
    alignItems: 'center',
    justifyContent: 'center',
  },
announcementTime: {
  fontSize: 12,
  color: colors.secondaryText,
  marginLeft: 6,
  opacity: 0.8,
},
  announcementText: {
    fontSize: 16,
    marginTop: 10,
    color: '#000',
    lineHeight: 22,
    width: '100%',
    flexShrink: 1,
    opacity: 1,
  },
  menuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 4,
  },
  menuItemCard: {
    width: 160,
    backgroundColor: colors.cardBackground,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  menuItemImage: {
    width: '100%',
    height: 120,
    backgroundColor: colors.secondaryBackground,
  },
  menuItemImagePlaceholder: {
    width: '100%',
    height: 120,
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemInfo: {
    padding: 12,
  },
  menuItemName: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.text,
    marginBottom: 4,
  },
  menuItemPrice: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: colors.primary,
  },
  emptyAnnouncementState: {
    alignItems: 'center',
    paddingVertical: 12,
    gap: 6,
  },
  emptyAnnouncementText: {
    fontSize: 14,
    color: colors.secondaryText,
    fontWeight: '500' as const,
    textAlign: 'center',
  },
  ownerEditBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 12,
    marginBottom: 16,
  },
  ownerEditBannerText: {
    fontSize: 15,
    fontWeight: '600' as const,
    color: colors.background,
  },
  menuItemModalContent: {
    backgroundColor: colors.cardBackground,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    marginTop: 'auto',
  },
  menuItemModalClose: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemModalImage: {
    width: '100%',
    height: 280,
    backgroundColor: colors.secondaryBackground,
  },
  menuItemModalImagePlaceholder: {
    width: '100%',
    height: 280,
    backgroundColor: colors.secondaryBackground,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemModalInfo: {
    padding: 24,
  },
  menuItemModalName: {
    fontSize: 26,
    fontWeight: '700' as const,
    color: colors.text,
    marginBottom: 8,
  },
  menuItemModalPrice: {
    fontSize: 22,
    fontWeight: '700' as const,
    color: colors.primary,
    marginBottom: 16,
  },
  menuItemModalDescription: {
    fontSize: 16,
    color: colors.secondaryText,
    lineHeight: 24,
  },
});
