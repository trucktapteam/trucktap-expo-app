import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Share, Alert, Animated } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { MapPin, Utensils, Pencil, Settings, Clock, Image as ImageIcon, BarChart3, Megaphone, QrCode, Share2, ScanLine, CheckCircle2, AlertCircle, Eye, Link, Sparkles, Bell, ArchiveRestore, Truck, CalendarDays, ChevronRight } from 'lucide-react-native';
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
import { getTruckCommandCenter } from '@/lib/truckCommandCenter';
import { isTruckVisibilitySetupComplete } from '@/lib/truckVisibilitySetup';
import { getTruckCoachMessage } from '@/lib/truckCoach';
import { getTruckCoachProgressCelebration } from '@/lib/truckCoachProgress';
import { getTruckOpportunities } from '@/lib/truckOpportunities';
import type { TruckOpportunityAction, TruckOpportunityPriority } from '@/lib/truckOpportunities';

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

const getDailyBriefingGreeting = (): string => {
  const hour = new Date().getHours();

  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
};

let hasShownOwnerSetupPromptThisSession = false;

const requiredProfileLabels = {
  name: 'Truck Name',
  logo: 'Logo',
  hero: 'Hero Image',
  service_area: 'Primary Service Area',
} as const;

const publicProfileRequirements = ['name', 'logo', 'hero', 'service_area'] as const;

const opportunityPriorityLabels: Record<TruckOpportunityPriority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
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
    goOffline,
    getQrScanStats,
    hasHoursSet,
    isProfileComplete,
    hasUnreadOwnerUpdates,
    qrShared,
    ownerMessages,
    announcements,
    upcomingStops,
    reviews,
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
  const [coachProgressCelebration, setCoachProgressCelebration] = useState('');
  const [showWelcomeSetupPrompt, setShowWelcomeSetupPrompt] = useState(!hasShownOwnerSetupPromptThisSession);
  
  const bannerOpacity = useRef(new Animated.Value(0)).current;
  const bannerTranslateY = useRef(new Animated.Value(-5)).current;
  
  const qrStats = truck ? getQrScanStats(truck.id) : { totalScans: 0, lastScanned: undefined };

  const menuItems = useTruckMenu(truck?.id || '');
  const rating = useTruckRating(truck?.id || '');

  const truckOpenNow = truck?.open_now ?? false;

  const hoursSet = truck ? hasHoursSet(truck.id) : false;
  const hasUnread = hasUnreadOwnerUpdates();

  useEffect(() => {
    if (truck) {
      if (DEBUG) console.log('[Dashboard] hoursSet:', hoursSet, 'hasSharedQr:', qrShared);
    }
  }, [truck, hoursSet, qrShared]);

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
      await goOffline({
        truckId: truck.id,
        source: 'manual',
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
  const commandCenter = useMemo(
    () => truck
      ? getTruckCommandCenter({
        ...truck,
        ownerMessages,
        announcements,
        upcomingStops,
        reviews,
        menuItems,
        hasOperatingHours: hoursSet,
      })
      : null,
    [announcements, hoursSet, menuItems, ownerMessages, reviews, truck, upcomingStops]
  );
  const truckCoach = commandCenter ? getTruckCoachMessage(commandCenter) : null;
  const displayTruckCoach = truckCoach
    ? {
      ...truckCoach,
      celebration: coachProgressCelebration || truckCoach.celebration,
    }
    : null;
  const dailyBriefingGreeting = useMemo(() => getDailyBriefingGreeting(), []);
  const scheduledStopWarning = commandCenter?.eventReadiness === 'starts_soon'
    ? {
      message: 'Your stop starts soon. Go LIVE before customers arrive.',
      urgent: false,
    }
    : commandCenter?.eventReadiness === 'started'
      ? {
        message: "Your scheduled stop has started. Customers may think you're closed until you Go LIVE.",
        urgent: true,
      }
      : null;
  const incompleteProfileEducation = commandCenter &&
    commandCenter.health === 'Hidden' &&
    !isArchived &&
    truck?.is_test !== true &&
    !commandCenter.profileCompleteness.complete
    ? {
      completedCount: commandCenter.profileCompleteness.completedCount,
      totalCount: commandCenter.profileCompleteness.totalCount,
      progressPercent: (commandCenter.profileCompleteness.completedCount / commandCenter.profileCompleteness.totalCount) * 100,
      missingLabels: commandCenter.profileCompleteness.missing.map(requirement => requiredProfileLabels[requirement]),
    }
    : null;
  const shouldShowSetupPrompt =
    !isAdminViewOnly &&
    !isArchived &&
    !!truck &&
    !isTruckVisibilitySetupComplete(truck) &&
    showWelcomeSetupPrompt &&
    !hasShownOwnerSetupPromptThisSession;

  const commandActionRoute = useMemo(() => {
    const action = commandCenter?.nextAction;

    switch (action) {
      case 'Add Truck Name':
      case 'Upload Logo':
      case 'Upload Hero Image':
      case 'Add Service Area':
        return '/(truck)/edit-profile';
      case 'Add Menu':
        return '/(truck)/menu-editor';
      case 'Add Gallery Photos':
        return '/(truck)/gallery';
      case 'Add Operating Hours':
        return '/(truck)/operating-hours';
      case 'Add Upcoming Stop':
        return '/(truck)/upcoming-stops';
      case 'Check Messages':
        return '/(truck)/owner-updates';
      case 'Add Announcement':
        return '/(truck)/announcements';
      case 'Respond to Reviews':
        return '/(truck)/reviews';
      default:
        return null;
    }
  }, [commandCenter?.nextAction]);
  const showCommandAction = !!commandCenter && (commandCenter.nextAction === 'Go LIVE' || !!commandActionRoute);

  const handleDismissSetupPrompt = () => {
    hasShownOwnerSetupPromptThisSession = true;
    setShowWelcomeSetupPrompt(false);
  };

  const handleOpenVisibilityWizard = () => {
    hasShownOwnerSetupPromptThisSession = true;
    setShowWelcomeSetupPrompt(false);
    router.push('/(truck)/visibility-wizard' as any);
  };
  const opportunities = useMemo(
    () => truck
      ? getTruckOpportunities({
        ...truck,
        upcomingStops,
        announcements,
        menuItems,
        reviews,
      }).slice(0, 3)
      : [],
    [announcements, menuItems, reviews, truck, upcomingStops]
  );

  const handleCommandCenterAction = () => {
    if (!commandCenter) return;

    if (commandCenter.nextAction === 'Go LIVE') {
      handleGoLive();
      return;
    }

    if (commandActionRoute) {
      router.push(commandActionRoute as any);
    }
  };

  const handleCompleteProfile = () => {
    router.push('/(truck)/edit-profile' as any);
  };

  const handleBrowseAsCustomer = () => {
    router.push('/(customer)/(tabs)/discover' as any);
  };

  const getOpportunityActionLabel = (action: TruckOpportunityAction): string | null => {
    switch (action) {
      case 'schedule':
        return 'Add stop';
      case 'announcement':
        return 'Share update';
      case 'gallery':
        return 'Add photos';
      case 'reviews':
        return 'Reply';
      case 'goLive':
        return 'Go Live';
      default:
        return null;
    }
  };

  const getOpportunityPriorityPillStyle = (priority: TruckOpportunityPriority) => {
    switch (priority) {
      case 'high':
        return styles.opportunityPriorityHigh;
      case 'medium':
        return styles.opportunityPriorityMedium;
      case 'low':
        return styles.opportunityPriorityLow;
    }
  };

  const getOpportunityPriorityTextStyle = (priority: TruckOpportunityPriority) => {
    switch (priority) {
      case 'high':
        return styles.opportunityPriorityTextHigh;
      case 'medium':
        return styles.opportunityPriorityTextMedium;
      case 'low':
        return styles.opportunityPriorityTextLow;
    }
  };

  const handleOpportunityAction = (action: TruckOpportunityAction) => {
    switch (action) {
      case 'schedule':
        router.push('/(truck)/upcoming-stops' as any);
        return;
      case 'announcement':
        router.push('/(truck)/announcements' as any);
        return;
      case 'gallery':
        router.push('/(truck)/gallery' as any);
        return;
      case 'reviews':
        router.push('/(truck)/reviews' as any);
        return;
      case 'goLive':
        handleGoLive();
        return;
      default:
        return;
    }
  };

  useEffect(() => {
    let mounted = true;

    if (!truck || !commandCenter || isAdminViewOnly) {
      setCoachProgressCelebration('');
      return () => {
        mounted = false;
      };
    }

    getTruckCoachProgressCelebration({
      truck,
      commandCenter,
      upcomingStops,
      announcements,
      reviews,
    })
      .then(celebration => {
        if (mounted) {
          setCoachProgressCelebration(celebration?.message ?? '');
        }
      })
      .catch(error => {
        if (__DEV__) {
          console.log('[Dashboard] Coach progress celebration failed:', error?.message ?? error);
        }
        if (mounted) {
          setCoachProgressCelebration('');
        }
      });

    return () => {
      mounted = false;
    };
  }, [announcements, commandCenter, isAdminViewOnly, reviews, truck, upcomingStops]);

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
              <Text style={styles.dataLabel}>legacy readiness complete</Text>
              <Text style={styles.dataValue}>{profileComplete ? 'true' : 'false'}</Text>
            </View>
            <View style={styles.dataRow}>
              <Text style={styles.dataLabel}>customer visible</Text>
              <Text style={styles.dataValue}>{isVisibleToCustomers ? 'Likely' : 'No'}</Text>
            </View>
          </View>

          <View style={styles.inspectionCard}>
            <Text style={styles.inspectionTitle}>Public profile requirements</Text>
            {publicProfileRequirements.map(requirement => (
              <View style={styles.dataRow} key={requirement}>
                <Text style={styles.dataLabel}>{requiredProfileLabels[requirement]}</Text>
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
        greeting={dailyBriefingGreeting}
        missionLabel="Next Action:"
        missionMessage={displayTruckCoach?.message ?? commandCenter?.nextAction}
        onCustomerViewPress={handleBrowseAsCustomer}
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

        {scheduledStopWarning && (
          <View style={[
            styles.scheduledStopWarning,
            scheduledStopWarning.urgent && styles.scheduledStopWarningUrgent,
          ]}>
            <View style={styles.scheduledStopWarningContent}>
              <AlertCircle
                size={21}
                color={scheduledStopWarning.urgent ? Colors.error : Colors.warning}
              />
              <Text style={styles.scheduledStopWarningText}>{scheduledStopWarning.message}</Text>
            </View>
            <TouchableOpacity
              style={[
                styles.scheduledStopWarningButton,
                scheduledStopWarning.urgent && styles.scheduledStopWarningButtonUrgent,
              ]}
              onPress={handleGoLive}
              activeOpacity={0.75}
            >
              <Text style={styles.scheduledStopWarningButtonText}>Go LIVE</Text>
            </TouchableOpacity>
          </View>
        )}

        {shouldShowSetupPrompt ? (
          <View style={styles.welcomeSetupPromptCard}>
            <View style={styles.welcomeSetupPromptHeader}>
              <View style={styles.welcomeSetupPromptIconWrap}>
                <AlertCircle size={22} color={Colors.warning} />
              </View>
              <View style={styles.welcomeSetupPromptTitleWrap}>
                <Text style={styles.welcomeSetupPromptTitle}>Welcome to TruckTap!</Text>
                <Text style={styles.welcomeSetupPromptBody}>
                  Your dashboard is ready. Customers cannot discover your truck until you complete a few quick setup steps.
                </Text>
              </View>
            </View>
            <View style={styles.welcomeSetupPromptActions}>
              <TouchableOpacity
                style={styles.welcomeSetupPromptPrimaryButton}
                onPress={handleOpenVisibilityWizard}
                activeOpacity={0.75}
              >
                <Text style={styles.welcomeSetupPromptPrimaryText}>Complete Setup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.welcomeSetupPromptSecondaryButton}
                onPress={handleDismissSetupPrompt}
                activeOpacity={0.75}
              >
                <Text style={styles.welcomeSetupPromptSecondaryText}>I&apos;ll Do It Later</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {incompleteProfileEducation && (
          <View style={styles.incompleteProfileCard}>
            <View style={styles.incompleteProfileHeader}>
              <View style={styles.incompleteProfileIconWrap}>
                <AlertCircle size={22} color={Colors.error} />
              </View>
              <View style={styles.incompleteProfileTitleWrap}>
                <Text style={styles.incompleteProfileTitle}>Your truck is hidden from customers</Text>
                <Text style={styles.incompleteProfileBody}>
                  Complete your profile so customers can find your truck on the map and in search.
                </Text>
              </View>
            </View>

            <Text style={styles.incompleteProfileProgress}>
              {incompleteProfileEducation.completedCount} of {incompleteProfileEducation.totalCount} required steps complete
            </Text>
            <View style={styles.incompleteProfileProgressTrack}>
              <View
                style={[
                  styles.incompleteProfileProgressFill,
                  { width: `${incompleteProfileEducation.progressPercent}%` },
                ]}
              />
            </View>

            <View style={styles.incompleteProfileMissingList}>
              {incompleteProfileEducation.missingLabels.map(label => (
                <View key={label} style={styles.incompleteProfileMissingItem}>
                  <AlertCircle size={16} color={Colors.error} />
                  <Text style={styles.incompleteProfileMissingText}>{label}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity
              style={styles.incompleteProfileButton}
              onPress={handleCompleteProfile}
              activeOpacity={0.75}
            >
              <Text style={styles.incompleteProfileButtonText}>Complete Profile</Text>
              <ChevronRight size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Today&apos;s Status</Text>
        </View>

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
              <Text style={styles.liveTitle}>{"You're live and customers can find you."}</Text>
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
              <Text style={styles.liveTitle}>Go live to start serving customers</Text>
              <Text style={styles.liveDescription}>
                Confirm your location to show your truck as open on the map.
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

        {commandCenter && (
          <View style={styles.commandCenterCard}>
            <View style={styles.commandCenterHeader}>
              <View style={styles.commandCenterIconWrap}>
                <Sparkles size={22} color={Colors.primary} />
              </View>
              <View style={styles.commandCenterTitleWrap}>
                <Text style={styles.commandCenterEyebrow}>TruckTap Coach</Text>
                <Text style={styles.commandCenterTitle}>Next Action</Text>
              </View>
            </View>

            <View style={styles.commandCenterNextBox}>
              {displayTruckCoach?.celebration ? (
                <Text style={styles.commandCenterCelebration}>{displayTruckCoach.celebration}</Text>
              ) : null}
              <Text style={styles.commandCenterNextAction}>{displayTruckCoach?.message ?? commandCenter.nextAction}</Text>
              {displayTruckCoach?.encouragement ? (
                <Text style={styles.commandCenterCoachText}>{displayTruckCoach.encouragement}</Text>
              ) : null}
              {displayTruckCoach?.estimatedTime ? (
                <Text style={styles.commandCenterEstimatedTime}>Estimated time: {displayTruckCoach.estimatedTime}</Text>
              ) : null}
            </View>

            {showCommandAction ? (
              <TouchableOpacity
                style={styles.commandCenterButton}
                onPress={handleCommandCenterAction}
                activeOpacity={0.75}
              >
                <Text style={styles.commandCenterButtonText}>{commandCenter.nextAction}</Text>
                <ChevronRight size={18} color="#fff" />
              </TouchableOpacity>
            ) : null}
          </View>
        )}

        <View style={styles.opportunitiesCard}>
          <View style={styles.opportunitiesHeader}>
            <View style={styles.opportunitiesTitleWrap}>
              <Text style={styles.opportunitiesTitle}>Opportunities</Text>
              <Text style={styles.opportunitiesSubtitle}>
                Quick checks to keep your truck easy to find.
              </Text>
            </View>
          </View>

          {opportunities.length > 0 ? (
            <View style={styles.opportunitiesList}>
              {opportunities.map(opportunity => {
                const actionLabel = getOpportunityActionLabel(opportunity.action);

                return (
                  <View key={opportunity.id} style={styles.opportunityItem}>
                    <View style={styles.opportunityContent}>
                      <View style={styles.opportunityTitleRow}>
                        <Text style={styles.opportunityTitle}>{opportunity.title}</Text>
                        <View style={[
                          styles.opportunityPriorityPill,
                          getOpportunityPriorityPillStyle(opportunity.priority),
                        ]}>
                          <Text style={[
                            styles.opportunityPriorityText,
                            getOpportunityPriorityTextStyle(opportunity.priority),
                          ]}>
                            {opportunityPriorityLabels[opportunity.priority]}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.opportunityDescription}>{opportunity.description}</Text>
                    </View>
                    {actionLabel ? (
                      <TouchableOpacity
                        style={styles.opportunityActionButton}
                        onPress={() => handleOpportunityAction(opportunity.action)}
                        activeOpacity={0.75}
                      >
                        <Text style={styles.opportunityActionText}>{actionLabel}</Text>
                        <ChevronRight size={15} color={Colors.primary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={styles.opportunitiesEmptyText}>You&apos;re all caught up.</Text>
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
          <Text style={styles.sectionTitle}>Business Activity</Text>
        </View>

        <StatsRow
          stats={{
            menuItems: menuItems.length,
            rating: rating.average || 0,
          }}
        />

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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Owner Tools</Text>
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

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Customer-Facing Profile</Text>
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
          <Text style={styles.sectionTitle}>Growth Tools</Text>
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
    paddingHorizontal: 16,
    paddingBottom: 104,
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
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
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
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12,
  },
  adminControlButtonText: {
    color: '#fff',
    fontSize: 15,
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
  commandCenterCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}22`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  commandCenterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 11,
  },
  commandCenterIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandCenterTitleWrap: {
    flex: 1,
  },
  commandCenterEyebrow: {
    fontSize: 11,
    fontWeight: '800' as const,
    color: Colors.primary,
    marginBottom: 3,
  },
  commandCenterTitle: {
    fontSize: 17,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  commandCenterNextBox: {
    backgroundColor: `${Colors.primary}0D`,
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
  },
  commandCenterNextAction: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark,
  },
  commandCenterCoachText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
    marginTop: 6,
  },
  commandCenterEstimatedTime: {
    fontSize: 12,
    fontWeight: '700' as const,
    color: Colors.primary,
    marginTop: 8,
  },
  commandCenterCelebration: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.success,
    marginTop: 8,
  },
  commandCenterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  commandCenterButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
  },
  scheduledStopWarning: {
    backgroundColor: '#fff',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderColor: `${Colors.warning}40`,
    borderLeftColor: Colors.warning,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  scheduledStopWarningUrgent: {
    borderColor: `${Colors.error}35`,
    borderLeftColor: Colors.error,
  },
  scheduledStopWarningContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  scheduledStopWarningText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  scheduledStopWarningButton: {
    backgroundColor: Colors.warning,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  scheduledStopWarningButtonUrgent: {
    backgroundColor: Colors.error,
  },
  scheduledStopWarningButtonText: {
    fontSize: 14,
    fontWeight: '800' as const,
    color: '#fff',
  },
  welcomeSetupPromptCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  welcomeSetupPromptHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  welcomeSetupPromptIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: `${Colors.warning}15`,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  welcomeSetupPromptTitleWrap: {
    flex: 1,
  },
  welcomeSetupPromptTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 6,
  },
  welcomeSetupPromptBody: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray,
  },
  welcomeSetupPromptActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  welcomeSetupPromptPrimaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  welcomeSetupPromptPrimaryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700' as const,
  },
  welcomeSetupPromptSecondaryButton: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: Colors.lightGray,
  },
  welcomeSetupPromptSecondaryText: {
    color: Colors.dark,
    fontSize: 14,
    fontWeight: '600' as const,
  },
  incompleteProfileCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.error}25`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  incompleteProfileHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  incompleteProfileIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: `${Colors.error}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  incompleteProfileTitleWrap: {
    flex: 1,
  },
  incompleteProfileTitle: {
    fontSize: 16,
    fontWeight: '800' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  incompleteProfileBody: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  incompleteProfileProgress: {
    fontSize: 13,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 7,
  },
  incompleteProfileProgressTrack: {
    height: 6,
    width: '100%',
    backgroundColor: `${Colors.primary}18`,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 11,
  },
  incompleteProfileProgressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  incompleteProfileMissingList: {
    gap: 6,
    marginBottom: 12,
  },
  incompleteProfileMissingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  incompleteProfileMissingText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.dark,
  },
  incompleteProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
  },
  incompleteProfileButtonText: {
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
  },
  reliabilityCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
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
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 6,
  },
  reliabilityText: {
    fontSize: 13,
    color: Colors.dark,
    marginBottom: 4,
  },
  reliabilityMeta: {
    fontSize: 13,
    color: Colors.gray,
    marginBottom: 8,
  },
  reliabilityGuidance: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.gray,
  },
  liveCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
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
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 8,
  },
  liveDescription: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.gray,
    marginBottom: 6,
  },
  liveMetaText: {
    fontSize: 12,
    color: Colors.gray,
    marginBottom: 12,
  },
  liveButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  liveButtonSecondary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  liveButtonText: {
    fontSize: 15,
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
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  announcementIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: `${Colors.primary}12`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  announcementTextWrap: {
    flex: 1,
  },
  announcementTitle: {
    fontSize: 14,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 2,
  },
  announcementSubtitle: {
    fontSize: 12,
    color: Colors.gray,
  },
  sectionHeader: {
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  upcomingStopsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${Colors.primary}0D`,
    borderRadius: 14,
    padding: 13,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: `${Colors.primary}24`,
  },
  upcomingStopsIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
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
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  upcomingStopsSubtitle: {
    fontSize: 12,
    lineHeight: 17,
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
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  shareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  shareTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  shareDescription: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
    marginBottom: 12,
  },
  shareActions: {
    flexDirection: 'row',
    marginHorizontal: -6,
  },
  qrStatsContainer: {
    backgroundColor: `${Colors.primary}08`,
    borderRadius: 12,
    padding: 13,
    marginBottom: 12,
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
    fontSize: 21,
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
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
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
    marginBottom: 2,
  },
  checklistTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  checklistDismiss: {
    padding: 4,
  },
  checklistSubtitle: {
    fontSize: 12,
    color: Colors.gray,
    marginBottom: 12,
    lineHeight: 18,
  },
  checklistItems: {
    gap: 9,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 3,
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
    fontSize: 14,
    color: Colors.dark,
    fontWeight: '500' as const,
  },
  checklistItemTextComplete: {
    textDecorationLine: 'line-through',
    color: Colors.gray,
  },
  opportunitiesCard: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: `${Colors.primary}18`,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  opportunitiesHeader: {
    marginBottom: 12,
  },
  opportunitiesTitleWrap: {
    gap: 4,
  },
  opportunitiesTitle: {
    fontSize: 17,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  opportunitiesSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  opportunitiesList: {
    gap: 10,
  },
  opportunityItem: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  opportunityContent: {
    gap: 5,
  },
  opportunityTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  opportunityTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  opportunityDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  opportunityPriorityPill: {
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  opportunityPriorityHigh: {
    backgroundColor: `${Colors.error}14`,
  },
  opportunityPriorityMedium: {
    backgroundColor: `${Colors.warning}18`,
  },
  opportunityPriorityLow: {
    backgroundColor: `${Colors.primary}12`,
  },
  opportunityPriorityText: {
    fontSize: 11,
    fontWeight: '800' as const,
  },
  opportunityPriorityTextHigh: {
    color: Colors.error,
  },
  opportunityPriorityTextMedium: {
    color: Colors.warning,
  },
  opportunityPriorityTextLow: {
    color: Colors.primary,
  },
  opportunityActionButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  opportunityActionText: {
    fontSize: 12,
    fontWeight: '800' as const,
    color: Colors.primary,
  },
  opportunitiesEmptyText: {
    fontSize: 13,
    lineHeight: 19,
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
    padding: 18,
    borderRadius: 14,
    marginBottom: 14,
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
    gap: 12,
    marginBottom: 14,
  },
  shareMainIconContainer: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: `${Colors.primary}15`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shareMainTextContainer: {
    flex: 1,
  },
  shareMainTitle: {
    fontSize: 18,
    fontWeight: '700' as const,
    color: Colors.dark,
    marginBottom: 4,
  },
  shareMainTitleDisabled: {
    color: Colors.gray,
  },
  shareMainSubtitle: {
    fontSize: 13,
    color: Colors.gray,
    lineHeight: 18,
  },
  shareButtonsContainer: {
    gap: 10,
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
    paddingVertical: 13,
    paddingHorizontal: 18,
    borderRadius: 10,
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
    fontSize: 15,
    fontWeight: '700' as const,
    color: '#fff',
  },
  shareSecondaryButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  shareSecondaryButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: `${Colors.primary}10`,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: `${Colors.primary}30`,
  },
  shareSecondaryButtonText: {
    fontSize: 13,
    fontWeight: '600' as const,
    color: Colors.primary,
  },
  shareDisabledHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: `${Colors.gray}10`,
    padding: 13,
    borderRadius: 10,
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
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
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
    marginBottom: 12,
  },
  qrStatsTitle: {
    fontSize: 16,
    fontWeight: '700' as const,
    color: Colors.dark,
  },
  qrStatsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  qrStatItem: {
    flex: 1,
  },
  qrStatNumber: {
    fontSize: 21,
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
