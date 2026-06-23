import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, Animated } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MapPin, Utensils, Pencil, Settings, Clock, Image as ImageIcon, BarChart3, Megaphone, QrCode, Share2, ScanLine, CheckCircle2, X, AlertCircle, Eye, Link, Sparkles, Bell, ArchiveRestore, Truck, CalendarDays, ChevronRight } from 'lucide-react-native';
import Colors from '@/constants/colors';
import { useApp, useTruckMenu, useTruckRating } from '@/contexts/AppContext';
import * as Clipboard from 'expo-clipboard';
import HeaderCard from '@/components/HeaderCard';
import StatsRow from '@/components/StatsRow';
import DashboardCard from '@/components/DashboardCard';
import Toast from '@/components/Toast';
import { DEBUG } from '@/constants/debug';
import { getTruckShareUrl } from '@/lib/truckShare';
import { useTruckLifecycleLogger } from '@/hooks/useTruckLifecycleLogger';
import { getTruckProfileCompleteness } from '@/lib/truckProfileCompleteness';

const formatLastScanned = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

const formatLiveUpdatedText = (dateString?: string, nowMs: number = Date.now()): string => {
  if (!dateString) return 'Last updated just now';

  const timestamp = Date.parse(dateString);
  if (Number.isNaN(timestamp)) return 'Last updated just now';

  const diffMs = Math.max(0, nowMs - timestamp);
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffMins < 1) return 'Last updated just now';
  if (diffMins < 60) return `Last updated ${diffMins} min ago`;
  if (diffHours < 24) return `Last updated ${diffHours} hr ago`;
  return `Last updated ${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) === 1 ? '' : 's'} ago`;
};

const formatServingLocation = (truck: any): string => {
  const address = truck?.location?.address?.trim?.();
  if (address) {
    return address;
  }

  const latitude = truck?.location?.latitude;
  const longitude = truck?.location?.longitude;
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
  }

  return 'Location saved';
};

const getActivityReasonLabel = (reason?: string): string => {
  switch (reason) {
    case 'open_now':
      return 'Open now';
    case 'recent_live_activity':
      return 'Recent live activity';
    case 'upcoming_stop':
      return 'Upcoming scheduled stop';
    case 'recent_meaningful_activity':
      return 'Recent profile or planning activity';
    default:
      return '';
  }
};

export default function TruckDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  useTruckLifecycleLogger('TruckDashboard');
  const {
    currentUser,
    foodTrucks,
    selectedAdminTruckId,
    setSelectedAdminTruckId,
    getUserTruck,
    updateTruckDetails,
    getQrScanStats,
    checklistDismissed,
    dismissChecklist,
    hasHoursSet,
    isProfileComplete,
    hasUnreadOwnerUpdates,
    qrShared,
    getTruckActivityStatus,
  } = useApp();
  const ownerTruck = getUserTruck();
  const isAdmin = currentUser?.role === 'admin';
  const selectedAdminTruck = useMemo(
    () => foodTrucks.find(t => t.id === selectedAdminTruckId) ?? null,
    [foodTrucks, selectedAdminTruckId]
  );
  const selectedAdminTruckIsOwned =
    isAdmin && !!selectedAdminTruck && !!currentUser?.id && selectedAdminTruck.owner_id === currentUser.id;
  const truck = isAdmin && selectedAdminTruck ? selectedAdminTruck : ownerTruck;
  const isAdminViewOnly = isAdmin && !!selectedAdminTruck && !selectedAdminTruckIsOwned;
  const [toastVisible, setToastVisible] = useState(false);
  const [statusToast, setStatusToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({ visible: false, message: '', type: 'success' });
  const [liveNowMs, setLiveNowMs] = useState(Date.now());
  
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTranslateY = useRef(new Animated.Value(-5)).current;
  
  const qrStats = truck ? getQrScanStats(truck.id) : { totalScans: 0, lastScanned: undefined };

  const menuItems = useTruckMenu(truck?.id || '');
  const rating = useTruckRating(truck?.id || '');

  const truckOpenNow = truck?.open_now ?? false;

  const hoursSet = truck ? hasHoursSet(truck.id) : false;
  const hasPhotos = !!(truck && truck.images.length > 0);
  const hasMenu = menuItems.length > 0;
  const hasUnread = hasUnreadOwnerUpdates();

  useEffect(() => {
    if (truck) {
      if (DEBUG) console.log('[Checklist] hoursSet:', hoursSet, 'hasMenu:', hasMenu, 'hasPhotos:', hasPhotos, 'hasSharedQr:', qrShared);
    }
  }, [truck, hoursSet, hasMenu, hasPhotos, qrShared, menuItems.length]);

  const showChecklist = !checklistDismissed && (!hasMenu || !hasPhotos || !hoursSet);

  const handleGoLive = () => {
    if (__DEV__) {
      console.log('[Dashboard] Go Live pressed:', {
        truckId: truck?.id ?? null,
        openNow: truck?.open_now ?? null,
      });
    }
    router.push('/(truck)/update-location' as any);
  };

  const handleStopServing = async () => {
    if (!truck) return;

    try {
      await updateTruckDetails(truck.id, {
        open_now: false,
      });
      setStatusToast({
        visible: true,
        message: 'Truck is no longer serving and has been removed from the map.',
        type: 'success',
      });
    } catch (error: any) {
      console.log('[Dashboard] Stop serving failed:', error?.message);
      setStatusToast({
        visible: true,
        message: 'Could not update serving status. Please try again.',
        type: 'error',
      });
    }
  };

  const profileComplete = truck ? isProfileComplete(truck.id) : false;
  const publicProfileCompleteness = useMemo(
    () => truck ? getTruckProfileCompleteness(truck) : null,
    [truck]
  );
  const profileUrl = getTruckShareUrl(truck?.id);

  const isArchived = truck ? (truck.archived === true || !!truck.archivedAt) : false;
  const hasTruckIdentity = !!truck?.id;
  const hasShareableRoute = typeof profileUrl === 'string' && profileUrl.trim().length > 0;
  const canShareTruck = hasTruckIdentity && hasShareableRoute && !isArchived;
  const liveLocationText = truck ? formatServingLocation(truck) : '';
  const liveUpdatedText = formatLiveUpdatedText(truck?.lastUpdated, liveNowMs);
  const truckActivityStatus = getTruckActivityStatus(truck);
  const truckActivityReason = getActivityReasonLabel(truckActivityStatus.activeReason);

  useEffect(() => {
    if (isArchived) {
      Animated.parallel([
        Animated.timing(bannerOpacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(bannerTranslateY, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      bannerOpacity.setValue(0);
      bannerTranslateY.setValue(-5);
    }
  }, [isArchived, bannerOpacity, bannerTranslateY]);

  useEffect(() => {
    if (!truckOpenNow) {
      return;
    }

    setLiveNowMs(Date.now());
    const intervalId = setInterval(() => {
      setLiveNowMs(Date.now());
    }, 60000);

    return () => clearInterval(intervalId);
  }, [truckOpenNow]);

  const showToast = () => {
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  const handleCopyLink = async () => {
    if (!truck || !canShareTruck) {
      Alert.alert('Sharing unavailable', 'This truck does not currently have a valid shareable public page.');
      return;
    }
    try {
      await Clipboard.setStringAsync(profileUrl);
      showToast();
    } catch (error) {
      console.error('Failed to copy link:', error);
    }
  };

  const handleShareProfile = async () => {
    if (!truck || !canShareTruck) {
      Alert.alert('Sharing unavailable', 'This truck does not currently have a valid shareable public page.');
      return;
    }
    try {
      await Share.share({
        message: `Check out ${truck.name} on TruckTap! ${profileUrl}`,
        url: profileUrl,
        title: `${truck.name} - TruckTap`,
      });
    } catch (error) {
      console.error('Failed to share:', error);
    }
  };

  const handleShareQR = () => {
    if (!truck || !canShareTruck) {
      Alert.alert('Sharing unavailable', 'This truck does not currently have a valid shareable public page.');
      return;
    }
    router.push('/(truck)/qr' as any);
  };

  const handleRestoreTruck = () => {
    if (!truck) return;
    void updateTruckDetails(truck.id, {
      archived: false,
      archivedAt: undefined,
      archiveReason: undefined,
      lastOwnerActivityAt: Date.now(),
    });
    setStatusToast({
      visible: true,
      message: 'Truck restored successfully',
      type: 'success'
    });
  };

  const handleChooseTruck = () => {
    const targetRoute = '/admin-truck-picker';
    if (__DEV__) {
      console.log('Admin switching truck');
      console.log('[TruckDashboard] Choose a Truck pressed:', { currentPathname: pathname, targetRoute });
      Alert.alert('Debug navigation', `Navigating to ${targetRoute}`);
    }

    try {
      router.push(targetRoute as any);
    } catch (error) {
      console.log('[TruckDashboard] Choose a Truck navigation failed:', {
        currentPathname: pathname,
        targetRoute,
        error,
      });
    }
  };

  const handleExitTruckMode = () => {
    const targetRoute = '/admin-truck-picker';
    if (__DEV__) {
      console.log('Admin exiting truck mode');
      console.log('[TruckDashboard] Exit Truck Mode pressed:', { currentPathname: pathname, targetRoute });
    }

    setSelectedAdminTruckId(null);

    try {
      router.push(targetRoute as any);
    } catch (error) {
      console.log('[TruckDashboard] Exit Truck Mode navigation failed:', {
        currentPathname: pathname,
        targetRoute,
        error,
      });
    }
  };

  const handleCreateTruck = () => {
    const targetRoute = '/truck-setup';
    if (__DEV__) {
      console.log('[TruckDashboard] Create a Truck pressed:', { currentPathname: pathname, targetRoute });
      Alert.alert('Debug navigation', `Navigating to ${targetRoute}`);
    }

    try {
      router.push(targetRoute as any);
    } catch (error) {
      console.log('[TruckDashboard] Create a Truck navigation failed:', {
        currentPathname: pathname,
        targetRoute,
        error,
      });
    }
  };

  const handleAdminViewPublicProfile = () => {
    if (!truck) return;
    router.push(`/truck/${truck.id}?preview=true` as any);
  };

  const handleAdminViewOnMap = () => {
    if (!truck || isArchived) return;
    const hasCoordinates =
      Number.isFinite(truck.location?.latitude) && Number.isFinite(truck.location?.longitude);
    router.push((hasCoordinates ? '/(customer)/(tabs)/full-map' : '/(customer)/(tabs)/discover') as any);
  };

  const handleAdminCopyLink = async () => {
    if (!truck || !profileUrl) return;

    try {
      await Clipboard.setStringAsync(profileUrl);
      showToast();
    } catch (error) {
      console.error('[Dashboard] Admin copy link failed:', error);
      Alert.alert('Copy unavailable', 'Unable to copy the public truck link right now.');
    }
  };

  const handleAdminShareLink = async () => {
    if (!truck || !profileUrl) return;

    try {
      await Share.share({
        message: `Check out ${truck.name} on TruckTap! ${profileUrl}`,
        url: profileUrl,
        title: `${truck.name} - TruckTap`,
      });
    } catch (error) {
      console.error('[Dashboard] Admin share link failed:', error);
    }
  };

  if (!truck) {
    if (isAdmin) {
      return (
        <View style={styles.container}>
          <View style={styles.emptyStateContainer}>
            <View style={styles.emptyStateIcon}>
              <Truck size={36} color={Colors.primary} />
            </View>
            <Text style={styles.emptyStateTitle}>No truck selected</Text>
            <Text style={styles.emptyStateText}>No truck selected. Choose or create a truck to manage.</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={handleChooseTruck}
              activeOpacity={0.7}
            >
              <Text style={styles.emptyStateButtonText}>Choose a Truck</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.emptyStateButton, styles.emptyStateSecondaryButton]}
              onPress={handleCreateTruck}
              activeOpacity={0.7}
            >
              <Text style={[styles.emptyStateButtonText, styles.emptyStateSecondaryButtonText]}>Create a Truck</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.container}>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Truck not found</Text>
        </View>
      </View>
    );
  }

  if (isAdminViewOnly) {
    const hasCoordinates =
      Number.isFinite(truck.location?.latitude) && Number.isFinite(truck.location?.longitude);
    const isVisibleToCustomers = !isArchived;

    return (
      <View style={styles.container}>
        <HeaderCard
          truckName={truck.name}
          cuisineType={truck.cuisine_type}
          logoUrl={truck.logo}
          isOpen={truckOpenNow}
        />

        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        >
          <View style={styles.readOnlyCard}>
            <View style={styles.readOnlyHeader}>
              <Eye size={22} color={Colors.primary} />
              <Text style={styles.readOnlyTitle}>Admin inspection mode</Text>
            </View>
            <Text style={styles.readOnlyText}>
              No owner actions available.
            </Text>
          </View>

          <View style={styles.inspectionCard}>
            <Text style={styles.inspectionTitle}>Key data</Text>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>open_now</Text>
              <Text style={styles.dataValue}>{truck.open_now ? 'true' : 'false'}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>location label</Text>
              <Text style={styles.dataValue}>{truck.location?.address || 'Not set'}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>latitude</Text>
              <Text style={styles.dataValue}>
                {hasCoordinates ? truck.location.latitude.toFixed(6) : 'Not set'}
              </Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>longitude</Text>
              <Text style={styles.dataValue}>
                {hasCoordinates ? truck.location.longitude.toFixed(6) : 'Not set'}
              </Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>owner_id</Text>
              <Text style={styles.dataValue}>{truck.owner_id || 'Not set'}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>archived</Text>
              <Text style={styles.dataValue}>{isArchived ? 'true' : 'false'}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>legacy profile complete</Text>
              <Text style={styles.dataValue}>{profileComplete ? 'true' : 'false'}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>customer visible</Text>
              <Text style={styles.dataValue}>{isVisibleToCustomers ? 'Likely' : 'No'}</Text>
            </View>
          </View>

          <View style={styles.inspectionCard}>
            <Text style={styles.inspectionTitle}>Public profile requirements</Text>
            {(['name', 'logo', 'hero'] as const).map(requirement => (
              <View style={styles.dataRow} key={requirement}>
                <Text style={styles.dataLabel}>{requirement}</Text>
                <Text style={styles.dataValue}>
                  {publicProfileCompleteness?.missing.includes(requirement) ? 'Missing' : 'Complete'}
                </Text>
              </View>
            ))}
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>completion</Text>
              <Text style={styles.dataValue}>
                {publicProfileCompleteness?.completedCount ?? 0}/{publicProfileCompleteness?.totalCount ?? 3}
              </Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>missing fields</Text>
              <Text style={styles.dataValue}>
                {publicProfileCompleteness?.missing.length
                  ? publicProfileCompleteness.missing.join(', ')
                  : 'None'}
              </Text>
            </View>
          </View>

          <View style={styles.inspectionCard}>
            <Text style={styles.inspectionTitle}>Inspection actions</Text>
            <TouchableOpacity
              style={styles.inspectionButton}
              onPress={handleAdminViewPublicProfile}
              activeOpacity={0.7}
            >
              <Eye size={20} color="#fff" />
              <Text style={styles.inspectionButtonText}>View Public Profile as Customer</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.inspectionButton, !isVisibleToCustomers && styles.inspectionButtonDisabled]}
              onPress={handleAdminViewOnMap}
              disabled={!isVisibleToCustomers}
              activeOpacity={0.7}
            >
              <MapPin size={20} color="#fff" />
              <Text style={styles.inspectionButtonText}>
                {hasCoordinates ? 'View on Map' : 'View in Discover'}
              </Text>
            </TouchableOpacity>

            <View style={styles.inspectionButtonRow}>
              <TouchableOpacity
                style={[styles.inspectionButton, styles.inspectionButtonHalf]}
                onPress={handleAdminCopyLink}
                activeOpacity={0.7}
              >
                <Link size={18} color="#fff" />
                <Text style={styles.inspectionButtonText}>Copy Link</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.inspectionButton, styles.inspectionButtonHalf]}
                onPress={handleAdminShareLink}
                activeOpacity={0.7}
              >
                <Share2 size={18} color="#fff" />
                <Text style={styles.inspectionButtonText}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={handleChooseTruck}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyStateButtonText}>Admin: Choose Another Truck</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={handleExitTruckMode}
            activeOpacity={0.7}
          >
            <Text style={styles.emptyStateButtonText}>Admin: Exit Truck Mode</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.emptyStateButton, styles.emptyStateSecondaryButton]}
            onPress={handleCreateTruck}
            activeOpacity={0.7}
          >
            <Text style={[styles.emptyStateButtonText, styles.emptyStateSecondaryButtonText]}>Create a Truck</Text>
          </TouchableOpacity>
        </ScrollView>

        {toastVisible && (
          <View style={styles.toast}>
            <CheckCircle2 size={16} color="#fff" />
            <Text style={styles.toastText}>Link copied</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <HeaderCard 
        truckName={truck.name}
        cuisineType={truck.cuisine_type}
        logoUrl={truck.logo}
        isOpen={truckOpenNow}
      />

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
      >
        {isAdmin && (
          <View style={styles.adminControlsCard}>
            <TouchableOpacity
              style={styles.adminControlButton}
              onPress={handleChooseTruck}
              activeOpacity={0.7}
            >
              <Text style={styles.adminControlButtonText}>Admin: Choose Another Truck</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.adminControlButton}
              onPress={handleExitTruckMode}
              activeOpacity={0.7}
            >
              <Text style={styles.adminControlButtonText}>Admin: Exit Truck Mode</Text>
            </TouchableOpacity>
          </View>
        )}

        {isArchived && (
          <Animated.View
            style={[
              styles.archiveBanner,
              {
                opacity: bannerOpacity,
                transform: [{ translateY: bannerTranslateY }],
              }
            ]}
          >
            <View style={styles.archiveBannerContent}>
              <AlertCircle size={20} color={Colors.error} />
              <View style={styles.archiveBannerText}>
                <Text style={styles.archiveBannerTitle}>Truck Archived</Text>
                <Text style={styles.archiveBannerSubtitle}>This truck is hidden from customers</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.restoreButton}
              onPress={handleRestoreTruck}
              activeOpacity={0.7}
            >
              <ArchiveRestore size={18} color="#fff" />
              <Text style={styles.restoreButtonText}>Restore Truck</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        <View style={styles.reliabilityCard}>
          <View style={styles.reliabilityHeader}>
            <View style={[
              styles.reliabilityBadge,
              truckActivityStatus.activeOnTruckTap ? styles.reliabilityBadgeActive : styles.reliabilityBadgeQuiet,
            ]}>
              <Text style={[
                styles.reliabilityBadgeText,
                truckActivityStatus.activeOnTruckTap ? styles.reliabilityBadgeTextActive : styles.reliabilityBadgeTextQuiet,
              ]}>
                {truckActivityStatus.activeOnTruckTap ? 'Active on TruckTap' : 'Keep your profile fresh'}
              </Text>
            </View>
          </View>
          <Text style={styles.reliabilityTitle}>Customer activity signal</Text>
          {truckActivityStatus.lastActivityLabel ? (
            <Text style={styles.reliabilityText}>{truckActivityStatus.lastActivityLabel}</Text>
          ) : (
            <Text style={styles.reliabilityText}>No recent activity yet</Text>
          )}
          {truckActivityReason ? (
            <Text style={styles.reliabilityMeta}>Reason: {truckActivityReason}</Text>
          ) : null}
          {!truckActivityStatus.activeOnTruckTap ? (
            <Text style={styles.reliabilityGuidance}>
              Add an upcoming stop, go live, or update your profile to show customers you&apos;re active.
            </Text>
          ) : null}
        </View>

        {showChecklist && (
          <View style={styles.checklistCard}>
            <View style={styles.checklistHeader}>
              <Text style={styles.checklistTitle}>Getting Started</Text>
              <TouchableOpacity 
                onPress={dismissChecklist}
                style={styles.checklistDismiss}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <X size={20} color={Colors.gray} />
              </TouchableOpacity>
            </View>
            <Text style={styles.checklistSubtitle}>Complete these steps to get the most out of TruckTap</Text>
            
            <View style={styles.checklistItems}>
              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/menu-editor' as any)}
                disabled={hasMenu}
              >
                <View style={[styles.checklistIcon, hasMenu && styles.checklistIconComplete]}>
                  {hasMenu ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hasMenu && styles.checklistItemTextComplete]}>
                  Add menu
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/gallery' as any)}
                disabled={hasPhotos}
              >
                <View style={[styles.checklistIcon, hasPhotos && styles.checklistIconComplete]}>
                  {hasPhotos ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hasPhotos && styles.checklistItemTextComplete]}>
                  Upload photos
                </Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.checklistItem}
                onPress={() => router.push('/(truck)/operating-hours' as any)}
                disabled={hoursSet}
              >
                <View style={[styles.checklistIcon, hoursSet && styles.checklistIconComplete]}>
                  {hoursSet ? (
                    <CheckCircle2 size={20} color={Colors.success} />
                  ) : (
                    <View style={styles.checklistIconEmpty} />
                  )}
                </View>
                <Text style={[styles.checklistItemText, hoursSet && styles.checklistItemTextComplete]}>
                  Set hours
                </Text>
              </TouchableOpacity>
                   
            </View>
          </View>
        )}

        <View style={styles.liveCard}>
          <View style={styles.liveHeader}>
            <View style={[styles.liveBadge, truckOpenNow ? styles.liveBadgeOn : styles.liveBadgeOff]}>
              <Text style={[styles.liveBadgeText, truckOpenNow ? styles.liveBadgeTextOn : styles.liveBadgeTextOff]}>
                {truckOpenNow ? "You're Live • Customers can see you now" : 'Not Currently Serving'}
              </Text>
            </View>
          </View>
          {truckOpenNow ? (
            <>
              <Text style={styles.liveTitle}>{"You're live and visible to nearby customers"}</Text>
              <Text style={styles.liveDescription}>
                Serving at: {liveLocationText}
              </Text>
              <Text style={styles.liveMetaText}>{liveUpdatedText}</Text>
              <View style={styles.liveActions}>
                <TouchableOpacity
                  style={styles.liveButton}
                  onPress={() => router.push('/(truck)/update-location' as any)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.liveButtonText}>Update Location</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.liveButton, styles.liveButtonSecondary]}
                  onPress={handleStopServing}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.liveButtonText, styles.liveButtonTextSecondary]}>Stop Serving</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.liveTitle}>Go Live and Start Getting Customers</Text>
              <Text style={styles.liveDescription}>
                Confirm your serving location to mark your truck open and appear on the map.
              </Text>
              <TouchableOpacity
                style={styles.liveButton}
                onPress={handleGoLive}
                activeOpacity={0.7}
              >
                <Text style={styles.liveButtonText}>Go Live</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.upcomingStopsCard}
          onPress={() => router.push('/(truck)/upcoming-stops' as any)}
          activeOpacity={0.75}
        >
          <View style={styles.upcomingStopsIconWrap}>
            <CalendarDays size={24} color={Colors.primary} />
          </View>
          <View style={styles.upcomingStopsTextWrap}>
            <View style={styles.upcomingStopsHeader}>
              <Text style={styles.upcomingStopsTitle}>Upcoming Stops</Text>
              <View style={styles.newBadge}>
                <Text style={styles.newBadgeText}>NEW</Text>
              </View>
            </View>
            <Text style={styles.upcomingStopsSubtitle}>Plan future stops and get reminded before it is time to go live.</Text>
          </View>
          <ChevronRight size={20} color={Colors.primary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.announcementStrip}
          onPress={() => router.push('/(truck)/announcements' as any)}
          activeOpacity={0.75}
        >
          <View style={styles.announcementIconWrap}>
            <Megaphone size={18} color={Colors.primary} />
          </View>
          <View style={styles.announcementTextWrap}>
            <Text style={styles.announcementTitle}>Announcements</Text>
            <Text style={styles.announcementSubtitle}>Share a 7-day update with customers</Text>
          </View>
          <ChevronRight size={18} color={Colors.gray} />
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
        </View>

        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={MapPin}
            label="Location"
            onPress={() => router.push('/(truck)/update-location' as any)}
          />
          <DashboardCard 
            icon={Utensils}
            label="Menu Editor"
            onPress={() => router.push('/(truck)/menu-editor' as any)}
          />
        </View>

        <View style={styles.gridContainer}>
          <View style={styles.cardWithBadge}>
            <DashboardCard 
              icon={Clock}
              label="Operating Hours"
              onPress={() => router.push('/(truck)/operating-hours' as any)}
            />
            {!hoursSet && (
              <View style={styles.warningBadge}>
                <AlertCircle size={12} color={Colors.error} />
              </View>
            )}
          </View>
          <View style={styles.cardWithBadge}>
            <DashboardCard 
              icon={Bell}
              label="Message Center"
              onPress={() => router.push('/(truck)/owner-updates' as any)}
            />
            {hasUnread && (
              <View style={styles.notificationBadge} />
            )}
          </View>
        </View>

        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={ImageIcon}
            label="Gallery"
            onPress={() => router.push('/(truck)/gallery' as any)}
          />
          <DashboardCard 
            icon={Pencil}
            label="Edit Profile"
            onPress={() => router.push('/(truck)/edit-profile' as any)}
          />
        </View>

        <View style={styles.gridContainer}>
          <DashboardCard 
            icon={BarChart3}
            label="Analytics"
            onPress={() => router.push('/(truck)/analytics' as any)}
          />
          <DashboardCard 
            icon={Settings}
            label="Settings"
            onPress={() => router.push('/(truck)/settings' as any)}
          />
        </View>

        <StatsRow 
          stats={{
            menuItems: menuItems.length,
            rating: rating.average || 0,
          }}
        />

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Your Profile</Text>
        </View>

        <TouchableOpacity 
          style={styles.previewCard}
          onPress={() => router.push(`/truck/${truck.id}?preview=true` as any)}
          activeOpacity={0.7}
        >
          <View style={styles.previewIconContainer}>
            <Eye size={24} color={Colors.primary} />
          </View>
          <View style={styles.previewContent}>
            <Text style={styles.previewTitle}>Preview Your Profile</Text>
            <Text style={styles.previewSubtitle}>This is what customers see when they scan your QR code</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Share Your Truck</Text>
        </View>

        <View style={styles.shareMainCard}>
          <View style={styles.shareMainHeader}>
            <View style={styles.shareMainIconContainer}>
              <Sparkles size={28} color={canShareTruck ? Colors.primary : Colors.gray} />
            </View>
            <View style={styles.shareMainTextContainer}>
              <Text style={styles.shareMainTitle}>
                Share Your Truck
              </Text>
              <Text style={styles.shareMainSubtitle}>
                {canShareTruck
                  ? 'Your truck is ready to share'
                  : 'Sharing is unavailable until this truck has a valid public page.'}
              </Text>
            </View>
          </View>

          {canShareTruck && !profileComplete && (
            <View style={styles.shareDisabledHelper}>
              <AlertCircle size={16} color={Colors.warning} />
              <Text style={styles.shareDisabledHelperText}>
                Add menu items, photos, and operating hours to improve your public profile, but you can still share your truck right now.
              </Text>
            </View>
          )}

          {!canShareTruck && (
            <View style={styles.shareDisabledHelper}>
              <AlertCircle size={16} color={Colors.gray} />
              <Text style={styles.shareDisabledHelperText}>
                Sharing is currently unavailable because this truck is archived or missing a valid public link.
              </Text>
            </View>
          )}

          <View style={[styles.shareButtonsContainer, !canShareTruck && styles.shareButtonsContainerDisabled]}>
            <TouchableOpacity 
              style={[styles.sharePrimaryButton, !canShareTruck && styles.sharePrimaryButtonDisabled]}
              onPress={handleShareProfile}
              disabled={!canShareTruck}
              activeOpacity={0.7}
            >
              <Share2 size={20} color="#fff" />
              <Text style={styles.sharePrimaryButtonText}>Share via Text / Social</Text>
            </TouchableOpacity>

            <View style={styles.shareSecondaryButtons}>
              <TouchableOpacity 
                style={styles.shareSecondaryButton}
                onPress={handleShareQR}
                disabled={!canShareTruck}
                activeOpacity={0.7}
              >
                <QrCode size={20} color={Colors.primary} />
                <Text style={styles.shareSecondaryButtonText}>View QR Code</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.shareSecondaryButton}
                onPress={handleCopyLink}
                disabled={!canShareTruck}
                activeOpacity={0.7}
              >
                <Link size={20} color={Colors.primary} />
                <Text style={styles.shareSecondaryButtonText}>Copy Link</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {qrStats.totalScans > 0 && (
          <View style={styles.qrStatsCard}>
            <View style={styles.qrStatsHeader}>
              <ScanLine size={20} color={Colors.primary} />
              <Text style={styles.qrStatsTitle}>QR Engagement</Text>
            </View>
            <View style={styles.qrStatsRow}>
              <View style={styles.qrStatItem}>
                <Text style={styles.qrStatNumber}>{qrStats.totalScans}</Text>
                <Text style={styles.qrStatLabel}>Total Scans</Text>
              </View>
              {qrStats.lastScanned ? (
                <View style={styles.qrStatItem}>
                  <Text style={styles.qrStatNumber}>{formatLastScanned(qrStats.lastScanned)}</Text>
                  <Text style={styles.qrStatLabel}>Last Scanned</Text>
                </View>
              ) : null}
            </View>
          </View>
        )}
      </ScrollView>

      {toastVisible && (
        <View style={styles.toast}>
          <CheckCircle2 size={16} color="#fff" />
          <Text style={styles.toastText}>Link copied</Text>
        </View>
      )}

      {statusToast.visible && (
        <Toast 
          message={statusToast.message}
          type={statusToast.type}
          visible={statusToast.visible}
          onHide={() => setStatusToast({ ...statusToast, visible: false })}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lightGray,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 16,
    color: Colors.gray,
  },
  adminControlsCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  adminControlButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  adminControlButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  emptyStateIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${Colors.primary}15`,
    marginBottom: 20,
  },
  emptyStateTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyStateButton: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  emptyStateButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600' as const,
  },
  emptyStateSecondaryButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  emptyStateSecondaryButtonText: {
    color: Colors.dark,
  },
  readOnlyCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${Colors.primary}30`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  readOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  readOnlyTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  readOnlyText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray,
  },
  inspectionCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  inspectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 14,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  dataLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.gray,
  },
  dataValue: {
    flex: 1.4,
    fontSize: 13,
    color: Colors.dark,
    textAlign: 'right',
  },
  inspectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  inspectionButtonDisabled: {
    backgroundColor: Colors.gray,
    opacity: 0.65,
  },
  inspectionButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600' as const,
    textAlign: 'center',
  },
  inspectionButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inspectionButtonHalf: {
    flex: 1,
  },
  reliabilityCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  reliabilityHeader: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  reliabilityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  reliabilityBadgeActive: {
    backgroundColor: `${Colors.success}18`,
  },
  reliabilityBadgeQuiet: {
    backgroundColor: `${Colors.primary}12`,
  },
  reliabilityBadgeText: {
    fontSize: 12,
    fontWeight: '800' as const,
  },
  reliabilityBadgeTextActive: {
    color: Colors.success,
  },
  reliabilityBadgeTextQuiet: {
    color: Colors.primary,
  },
  reliabilityTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 6,
  },
  reliabilityText: {
    fontSize: 14,
    color: Colors.dark,
    marginBottom: 4,
  },
  reliabilityMeta: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 8,
  },
  reliabilityGuidance: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.gray,
  },
  liveCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  liveHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 12,
  },
  liveBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
  },
  liveBadgeOn: {
    backgroundColor: `${Colors.success}20`,
  },
  liveBadgeOff: {
    backgroundColor: `${Colors.gray}20`,
  },
  liveBadgeText: {
    fontSize: 12,
    fontWeight: '700' as const,
  },
  liveBadgeTextOn: {
    color: Colors.success,
  },
  liveBadgeTextOff: {
    color: Colors.gray,
  },
  liveTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  liveDescription: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.gray,
    marginBottom: 6,
  },
  liveMetaText: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 16,
  },
  liveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  liveButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveButtonText: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#fff',
  },
  liveButtonTextSecondary: {
    color: Colors.dark,
  },
  liveActions: {
    flexDirection: 'row',
    gap: 12,
  },
  announcementStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  announcementIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementTextWrap: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  announcementSubtitle: {
    fontSize: 12,
    color: Colors.gray,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  upcomingStopsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: `${Colors.primary}0D`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}24`,
  },
  upcomingStopsIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upcomingStopsTextWrap: {
    flex: 1,
  },
  upcomingStopsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  upcomingStopsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  upcomingStopsSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  newBadge: {
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800' as const,
    letterSpacing: 0.4,
  },
  gridContainer: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  shareCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  shareDescription: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
    marginBottom: 16,
  },
  shareActions: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  qrStatsContainer: {
    backgroundColor: `${Colors.primary}08`,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  qrStatBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  qrStatText: {
    flex: 1,
  },
  qrStatLabel: {
    fontSize: 13,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  qrStatValue: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginTop: 2,
  },
  lastScanInfo: {
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: `${Colors.primary}20`,
  },
  lastScanLabel: {
    fontSize: 12,
    color: Colors.gray,
    fontWeight: '500' as const,
  },
  lastScanValue: {
    fontSize: 14,
    color: Colors.dark,
    fontWeight: '600' as const,
    marginTop: 2,
  },
  checklistCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  checklistHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  checklistTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  checklistDismiss: {
    padding: 4,
  },
  checklistSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 16,
    lineHeight: 18,
  },
  checklistItems: {
    gap: 12,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 4,
  },
  checklistIcon: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checklistIconComplete: {
    opacity: 1,
  },
  checklistIconEmpty: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.gray,
  },
  checklistItemText: {
    fontSize: 15,
    color: Colors.dark,
    fontWeight: '500' as const,
  },
  checklistItemTextComplete: {
    textDecorationLine: 'line-through',
    color: Colors.gray,
  },
  cardWithBadge: {
    flex: 1,
    position: 'relative',
    marginHorizontal: 6,
  },
  warningBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Colors.error,
    shadowColor: Colors.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#FF8C00',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#FF8C00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 4,
  },
  previewCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 2,
    borderColor: `${Colors.primary}20`,
  },
  previewIconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewContent: {
    flex: 1,
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  previewSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
  },
  shareMainCard: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 2,
    borderColor: `${Colors.primary}30`,
  },
  shareMainCardDisabled: {
    borderColor: `${Colors.gray}20`,
    opacity: 0.7,
  },
  shareMainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 20,
  },
  shareMainIconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareMainTextContainer: {
    flex: 1,
  },
  shareMainTitle: {
    fontSize: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  shareMainTitleDisabled: {
    color: Colors.gray,
  },
  shareMainSubtitle: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
  shareButtonsContainer: {
    gap: 12,
  },
  shareButtonsContainerDisabled: {
    opacity: 0.6,
  },
  sharePrimaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  sharePrimaryButtonDisabled: {
    backgroundColor: Colors.gray,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  sharePrimaryButtonText: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: '#fff',
  },
  shareSecondaryButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  shareSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${Colors.primary}10`,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: `${Colors.primary}30`,
  },
  shareSecondaryButtonText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  shareDisabledHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${Colors.gray}10`,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: `${Colors.gray}20`,
  },
  shareDisabledHelperText: {
    flex: 1,
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
    fontWeight: '500' as const,
  },
  qrStatsCard: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  qrStatsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  qrStatsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  qrStatsRow: {
    flexDirection: 'row',
    gap: 20,
  },
  qrStatItem: {
    flex: 1,
  },
  qrStatNumber: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginBottom: 4,
  },
  toast: {
    position: 'absolute',
    bottom: 100,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.dark,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  toastText: {
    fontSize: 14,
    fontWeight: '600' as const,
    color: '#fff',
  },
  archiveBanner: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: Colors.error,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  archiveBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },
  archiveBannerText: {
    flex: 1,
  },
  archiveBannerTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  archiveBannerSubtitle: {
    fontSize: 13,
    color: Colors.gray,
  },
  restoreButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  restoreButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
  },
});
