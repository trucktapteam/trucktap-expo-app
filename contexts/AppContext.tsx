import createContextHook from '@nkzw/create-context-hook';
import { AppState as RNAppState } from 'react-native';
import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, FoodTruck, Review, ReviewReply, MenuItem, OperatingHours, Announcement, OwnerMessage, OwnerMessageType, UpcomingStop, UpcomingStopStatus } from '@/types';
import { teamUpdates } from '@/mocks/data';
import { DEBUG } from '@/constants/debug';
import { DEFAULT_TRUCK_HERO_IMAGE, DEFAULT_TRUCK_LOGO_IMAGE } from '@/constants/truckDefaults';
import { useAuth } from '@/contexts/AuthContext';
import { trackEvent } from '@/lib/analytics';
import { recordReviewEngagement } from '@/lib/appReviewPrompt';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { clearPushTokenForUser } from '@/lib/pushToken';
import { canViewIncompleteTruckProfile } from '@/lib/truckProfileCompleteness';
import { getPublicReadyStatus } from '@/lib/truckPublicReady';

const parseJsonArray = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
};

const hasDebugValidLocation = (truck: Pick<FoodTruck, 'location'>): boolean =>
  Number.isFinite(truck.location?.latitude) && Number.isFinite(truck.location?.longitude);

const FOREGROUND_REFRESH_DEBOUNCE_MS = 5000;
const STALE_OPEN_WINDOW_MS = 12 * 60 * 60 * 1000;
const ANNOUNCEMENT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

type TruckCheckInAnalytics = {
  allTime: number;
  thisMonth: number;
};

const getAnnouncementExpiresAt = (announcement: Pick<Announcement, 'timestamp' | 'expires_at'>): number => {
  const explicitExpiration = announcement.expires_at ? Date.parse(announcement.expires_at) : NaN;
  if (Number.isFinite(explicitExpiration)) {
    return explicitExpiration;
  }

  const createdAt = Date.parse(announcement.timestamp);
  if (!Number.isFinite(createdAt)) {
    return 0;
  }

  return createdAt + ANNOUNCEMENT_EXPIRATION_MS;
};

const isAnnouncementActive = (announcement: Announcement, now = Date.now()): boolean =>
  getAnnouncementExpiresAt(announcement) > now;

type LocationRow = {
  truck_id: string | number;
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
};

const normalizeUserRole = (role: unknown): User['role'] => {
  if (role === 'admin') return 'admin';
  if (role === 'truck' || role === 'owner') return 'truck';
  return 'customer';
};

const normalizeArchivedAtForDb = (archivedAt: FoodTruck['archivedAt']): string | null => {
  if (archivedAt === undefined || archivedAt === null) {
    return null;
  }

  if (typeof archivedAt === 'string') {
    const timestamp = Date.parse(archivedAt);
    return Number.isNaN(timestamp) ? new Date().toISOString() : archivedAt;
  }

  if (typeof archivedAt === 'number') {
    return new Date(archivedAt).toISOString();
  }

  return new Date().toISOString();
};

const getTruckLiveTimestamp = (truck: Pick<FoodTruck, 'lastLiveUpdatedAt' | 'lastUpdated'>): string | undefined =>
  truck.lastLiveUpdatedAt ?? truck.lastUpdated;

const isTruckStaleOpen = (truck: Pick<FoodTruck, 'id' | 'open_now' | 'lastLiveUpdatedAt' | 'lastUpdated' | 'liveExpiresAt'>): boolean => {
  if (!truck.open_now) return false;

  if (truck.liveExpiresAt) {
    const expiresAt = new Date(truck.liveExpiresAt).getTime();
    if (Number.isNaN(expiresAt)) return false;
    return Date.now() > expiresAt;
  }

  const timestampValue = getTruckLiveTimestamp(truck);
  if (!timestampValue) return false;

  const timestamp = new Date(timestampValue).getTime();
  if (Number.isNaN(timestamp)) return false;

  return Date.now() - timestamp > STALE_OPEN_WINDOW_MS;
};

const isMissingUpdatedAtError = (message?: string | null): boolean =>
  typeof message === 'string' && message.toLowerCase().includes('updated_at');

const isMissingLocationConflictTargetError = (message?: string | null): boolean =>
  typeof message === 'string' &&
  message.toLowerCase().includes('no unique or exclusion constraint') &&
  message.toLowerCase().includes('on conflict');

const isMissingRelationError = (message?: string | null): boolean =>
  typeof message === 'string' &&
  (
    (message.toLowerCase().includes('relation') && message.toLowerCase().includes('does not exist'))
    || message.toLowerCase().includes('schema cache')
    || message.toLowerCase().includes('could not find the table')
  );

const mapAppFieldsToDb = (updates: Partial<FoodTruck>): Record<string, any> => {
  const dbUpdates: Record<string, any> = {};

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (typeof updates.hero_image === 'string' && updates.hero_image.trim().length > 0) {
    dbUpdates.hero_image = updates.hero_image.trim();
  }
  if (typeof updates.logo === 'string' && updates.logo.trim().length > 0) {
    dbUpdates.logo = updates.logo.trim();
  }
  if (updates.cuisine_type !== undefined) dbUpdates.cuisine_type = updates.cuisine_type;
  if (updates.bio !== undefined) {
    dbUpdates.bio = updates.bio;
    dbUpdates.description = updates.bio;
  }
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.website !== undefined) dbUpdates.website = updates.website;
  if (updates.facebook_url !== undefined) dbUpdates.facebook_url = updates.facebook_url;
  if (updates.instagram_url !== undefined) dbUpdates.instagram_url = updates.instagram_url;
  if (updates.tiktok_url !== undefined) dbUpdates.tiktok_url = updates.tiktok_url;
  if (updates.service_area !== undefined) dbUpdates.service_area = updates.service_area;
  if (updates.trust_badges !== undefined) dbUpdates.trust_badges = updates.trust_badges;
  if (updates.open_now !== undefined) dbUpdates.is_open = updates.open_now;
  if (updates.archived !== undefined) dbUpdates.archived = updates.archived;
  if (Object.prototype.hasOwnProperty.call(updates, 'archivedAt')) {
    dbUpdates.archived_at = normalizeArchivedAtForDb(updates.archivedAt);
  }
  if (updates.archiveReason !== undefined) dbUpdates.archive_reason = updates.archiveReason;
  if (updates.archiveReason === undefined && Object.prototype.hasOwnProperty.call(updates, 'archiveReason')) {
    dbUpdates.archive_reason = null;
  }
  if (updates.is_test !== undefined) dbUpdates.is_test = updates.is_test;
  if (updates.operatingHours !== undefined) dbUpdates.operating_hours = updates.operatingHours;
  if (updates.images !== undefined) dbUpdates.gallery_images = updates.images;
  if (updates.menu_images !== undefined) dbUpdates.menu_images = updates.menu_images;
  if (Object.prototype.hasOwnProperty.call(updates, 'lastLiveUpdatedAt')) {
    dbUpdates.last_live_updated_at = updates.lastLiveUpdatedAt ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'liveStartedAt')) {
    dbUpdates.live_started_at = updates.liveStartedAt ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'liveExpiresAt')) {
    dbUpdates.live_expires_at = updates.liveExpiresAt ?? null;
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'liveSource')) {
    dbUpdates.live_source = updates.liveSource ?? null;
  }

  return dbUpdates;
};

const sanitizeTruckUpdatesForPersistence = (updates: Partial<FoodTruck>): Partial<FoodTruck> => {
  const sanitized = { ...updates };

  if (Object.prototype.hasOwnProperty.call(sanitized, 'hero_image')) {
    if (typeof sanitized.hero_image === 'string' && sanitized.hero_image.trim().length > 0) {
      sanitized.hero_image = sanitized.hero_image.trim();
    } else {
      delete sanitized.hero_image;
    }
  }

  if (Object.prototype.hasOwnProperty.call(sanitized, 'logo')) {
    if (typeof sanitized.logo === 'string' && sanitized.logo.trim().length > 0) {
      sanitized.logo = sanitized.logo.trim();
    } else {
      delete sanitized.logo;
    }
  }

  return sanitized;
};

const mapTeamUpdateToOwnerMessage = (update: (typeof teamUpdates)[number]): OwnerMessage => ({
  id: update.id,
  title: update.title,
  body: update.body,
  type: update.important ? 'important' : 'general',
  created_at: update.date,
  target_scope: 'all_trucks',
  target_truck_id: null,
  read_at: null,
});

const mapOwnerMessageRow = (row: any, readAt?: string | null): OwnerMessage => ({
  id: row.id?.toString?.() ?? '',
  title: row.title ?? '',
  body: row.body ?? '',
  type: ['general', 'important', 'maintenance', 'urgent'].includes(row.type) ? row.type : 'general',
  created_by: row.created_by ?? null,
  created_at: row.created_at ?? new Date().toISOString(),
  target_scope: row.target_scope === 'truck' ? 'truck' : 'all_trucks',
  target_truck_id: row.target_truck_id ?? null,
  read_at: readAt ?? null,
});

const UPCOMING_STOP_STATUSES: UpcomingStopStatus[] = ['scheduled', 'delayed', 'cancelled', 'sold_out', 'completed'];
const INACTIVITY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const ACTIVE_ON_TRUCKTAP_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const normalizeUpcomingStopStatus = (status: unknown): UpcomingStopStatus =>
  UPCOMING_STOP_STATUSES.includes(status as UpcomingStopStatus)
    ? status as UpcomingStopStatus
    : 'scheduled';

const mapUpcomingStopRow = (row: any): UpcomingStop => ({
  id: row.id?.toString?.() ?? '',
  truck_id: row.truck_id?.toString?.() ?? '',
  starts_at: row.starts_at ?? new Date().toISOString(),
  ends_at: row.ends_at ?? new Date().toISOString(),
  location_text: row.location_text ?? '',
  note: row.note ?? null,
  status: normalizeUpcomingStopStatus(row.status),
  created_at: row.created_at ?? undefined,
  updated_at: row.updated_at ?? undefined,
});

export type TruckActivitySummary = {
  inactive: boolean;
  lastLiveAt?: string;
  upcomingStopCount: number;
  announcementCount: number;
  recentAnnouncementCount: number;
  daysSinceActivity: number | null;
};

export type TruckActivityStatus = {
  lastActivityAt?: string;
  lastActivityLabel: string;
  activeOnTruckTap: boolean;
  activeReason:
    | 'open_now'
    | 'recent_live_activity'
    | 'upcoming_stop'
    | 'recent_meaningful_activity'
    | 'none';
  daysSinceActivity: number | null;
  hasUpcomingStop: boolean;
  hasRecentLiveActivity: boolean;
  hasRecentMeaningfulActivity: boolean;
};

export type LiveStatusSource =
  | 'manual'
  | 'schedule'
  | 'nudge_confirmation'
  | 'expiration'
  | 'archive';

export type GoLiveInput = {
  truckId: string;
  source: LiveStatusSource;
  location: FoodTruck['location'];
};

export type GoOfflineInput = {
  truckId: string;
  source: LiveStatusSource;
  updates?: Partial<Omit<FoodTruck, 'open_now'>>;
};

export type AppState = {
  currentUser: User | null;
  isOnboarded: boolean;
  foodTrucks: FoodTruck[];
  reviews: Review[];
  menuItems: MenuItem[];
  announcements: Announcement[];
  upcomingStops: UpcomingStop[];
  upcomingStopsLoading: boolean;
  checklistDismissed: boolean;
  showClosed: boolean;
  customerRadius: number;
  exploreMode: boolean;
  exploreCenter: { latitude: number; longitude: number; label?: string } | null;
  pendingRedirect: string | null;
  pendingNotificationRoute: string | null;
  isInitialNotificationResponseChecked: boolean;
  lastViewedOwnerUpdates: string | null;
  selectedAdminTruckId: string | null;
  ownerMessages: OwnerMessage[];
  setSelectedAdminTruckId: (truckId: string | null) => void;
  beginImagePickerSession: (source: string) => void;
  endImagePickerSession: (source: string) => void;
  setShowClosed: (value: boolean) => void;
  setCustomerRadius: (value: number) => void;
  setExploreMode: (value: boolean) => void;
  setExploreCenter: (center: { latitude: number; longitude: number; label?: string } | null) => void;
  setCurrentUser: (user: User) => void;
  completeOnboarding: () => void;
  refreshCustomerProfile: () => Promise<void>;
  toggleFavorite: (truckId: string) => void;
  addMenuImage: (truckId: string, imageUrl: string) => Promise<void>;
  removeMenuImage: (truckId: string, imageUrl: string) => Promise<void>;
  addTruckImage: (truckId: string, imageUrl: string) => void;
  removeTruckImage: (truckId: string, imageUrl: string) => void;
  updateTruckDetails: (truckId: string, updates: Partial<FoodTruck>) => Promise<void>;
  goLive: (input: GoLiveInput) => Promise<void>;
  goOffline: (input: GoOfflineInput) => Promise<void>;
  getUserTruck: () => FoodTruck | null;
  getOwnedTrucks: () => FoodTruck[];
  isOwner: boolean;
  isOwnerLoading: boolean;
  refreshOwnedTrucks: () => Promise<void>;
  refreshReviews: () => Promise<void>;
  addReview: (truckId: string, rating: number, text: string) => void;
  addReviewReply: (reviewId: string, truckId: string, body: string) => Promise<void>;
  updateReviewReply: (replyId: string, body: string) => Promise<void>;
  deleteReviewReply: (replyId: string) => Promise<void>;
  getReviews: (truckId: string) => Review[];
  getAverageRating: (truckId: string) => { average: number; count: number };
  addMenuItem: (item: Omit<MenuItem, 'id'>) => Promise<MenuItem | null>;
  updateMenuItem: (itemId: string, updates: Partial<MenuItem>) => Promise<void>;
  deleteMenuItem: (itemId: string) => void;
  updateOperatingHours: (truckId: string, hours: OperatingHours) => Promise<void>;
  getOperatingHours: (truckId: string) => OperatingHours | null;
  isTruckOpenNow: (truckId: string) => boolean;
  incrementView: (truckId: string) => void;
  incrementMenuView: (truckId: string) => void;
  incrementCall: (truckId: string) => void;
  incrementNavigation: (truckId: string) => void;
  incrementPhotoView: (truckId: string) => void;
  getTruckAnalytics: (truckId: string) => {
    views: number;
    favorites: number;
    menuViews: number;
    calls: number;
    navigations: number;
    photoViews: number;
    qrScans: number;
    lastQrScan?: string;
    customerCheckIns: number;
    customerCheckInsThisMonth: number;
  };
  incrementQrScan: (truckId: string, platform: string) => void;
  getQrScanStats: (truckId: string) => { totalScans: number; lastScanned?: string; };
  addAnnouncement: (truckId: string, message: string) => void;
  deleteAnnouncement: (announcementId: string) => void;
  getAnnouncements: (truckId: string) => Announcement[];
  getUpcomingStops: (truckId: string) => UpcomingStop[];
  getNextUpcomingStopForTruck: (truckId: string) => UpcomingStop | null;
  getTruckActivityStatus: (truck: FoodTruck | null | undefined) => TruckActivityStatus;
  getTruckActivitySummary: (truckId: string) => TruckActivitySummary;
  isTruckInactive: (truckId: string) => boolean;
  addUpcomingStop: (stop: Omit<UpcomingStop, 'id' | 'created_at' | 'updated_at'>) => Promise<UpcomingStop>;
  updateUpcomingStop: (stopId: string, updates: Partial<Omit<UpcomingStop, 'id' | 'truck_id' | 'created_at' | 'updated_at'>>) => Promise<UpcomingStop>;
  deleteUpcomingStop: (stopId: string) => Promise<void>;
  refreshUpcomingStops: () => Promise<void>;
  setTruckVerified: (truckId: string, value: boolean) => void;
  dismissChecklist: () => void;
  hasHoursSet: (truckId: string) => boolean;
  qrShared: boolean;
  markQrShared: () => void;
  addGalleryImage: (truckId: string, imageUrl: string) => void;
  removeGalleryImage: (truckId: string, imageUrl: string) => void;
  logout: () => void;
  // Legacy owner readiness helper for richer profile quality prompts.
  // Customer visibility uses truckProfileCompleteness instead.
  isProfileComplete: (truckId: string) => boolean;
  getDaysAgoText: (isoDate: string | undefined) => string;
  allTrucksLoading: boolean;
  refreshAllTrucks: () => Promise<void>;
  setPendingRedirect: (route: string | null) => void;
  setPendingNotificationRoute: (route: string | null) => void;
  setIsInitialNotificationResponseChecked: (checked: boolean) => void;
  consumePendingRedirect: () => string | null;
  getTeamUpdates: () => OwnerMessage[];
  markOwnerUpdatesViewed: () => Promise<void>;
  hasUnreadOwnerUpdates: () => boolean;
  refreshOwnerMessages: () => Promise<void>;
  createOwnerMessage: (message: { title: string; body: string; type: OwnerMessageType }) => Promise<void>;
  formatOperatingHours: (truckId: string) => string;
  supabaseOwnedTrucks: FoodTruck[];
};

export const [AppProvider, useApp] = createContextHook(() => {
  const { isAuthenticated, user: authUser, isLoading: authLoading } = useAuth();
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [isOnboarded, setIsOnboarded] = useState<boolean>(false);
  const [foodTrucks, setFoodTrucks] = useState<FoodTruck[]>([]);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [allTrucksLoading, setAllTrucksLoading] = useState<boolean>(true);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [upcomingStops, setUpcomingStops] = useState<UpcomingStop[]>([]);
  const [upcomingStopsLoading, setUpcomingStopsLoading] = useState<boolean>(true);
  const [checklistDismissed, setChecklistDismissed] = useState<boolean>(false);
  const [showClosed, setShowClosedState] = useState<boolean>(false);
  const [customerRadius, setCustomerRadiusState] = useState<number>(25);
  const [exploreMode, setExploreModeState] = useState<boolean>(false);
  const [exploreCenter, setExploreCenterState] = useState<{ latitude: number; longitude: number; label?: string } | null>(null);
  const [pendingRedirect, setPendingRedirectState] = useState<string | null>(null);
  const [pendingNotificationRoute, setPendingNotificationRoute] = useState<string | null>(null);
  const [isInitialNotificationResponseChecked, setIsInitialNotificationResponseChecked] = useState(false);
  const [lastViewedOwnerUpdates, setLastViewedOwnerUpdates] = useState<string | null>(null);
  const [selectedAdminTruckId, setSelectedAdminTruckId] = useState<string | null>(null);
  const [ownerMessages, setOwnerMessages] = useState<OwnerMessage[]>([]);
  const [supabaseOwnedTrucks, setSupabaseOwnedTrucks] = useState<FoodTruck[]>([]);
  const [truckCheckInAnalytics, setTruckCheckInAnalytics] = useState<Record<string, TruckCheckInAnalytics>>({});
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(true);
  const [qrShared, setQrShared] = useState<boolean>(false);
  const appStateRef = useRef(RNAppState.currentState);
  const selectedAdminTruckIdRef = useRef<string | null>(null);
  const lastForegroundRefreshAtRef = useRef(0);
  const foregroundRefreshInFlightRef = useRef(false);
  const suppressForegroundRefreshRef = useRef(0);
  const staleOpenAutoCloseAttemptedRef = useRef(new Set<string>());

  const beginImagePickerSession = useCallback((source: string) => {
    suppressForegroundRefreshRef.current += 1;
    if (__DEV__) {
      console.log('[AppContext] Foreground refresh suppressed for image picker:', {
        source,
        suppressCount: suppressForegroundRefreshRef.current,
      });
    }
  }, []);

  const endImagePickerSession = useCallback((source: string) => {
    suppressForegroundRefreshRef.current = Math.max(0, suppressForegroundRefreshRef.current - 1);
    if (__DEV__) {
      console.log('[AppContext] Foreground refresh suppression released:', {
        source,
        suppressCount: suppressForegroundRefreshRef.current,
      });
    }
  }, []);

  useEffect(() => {
    selectedAdminTruckIdRef.current = selectedAdminTruckId;
    if (__DEV__) {
      console.log('[AppContext] selectedAdminTruckId changed:', {
        selectedAdminTruckId,
        currentUserId: userProfile?.id ?? null,
        role: userProfile?.role ?? null,
      });
    }
  }, [selectedAdminTruckId, userProfile?.id, userProfile?.role]);

  // Helper to check if current user owns a truck
  const userOwnsTruck = useCallback((truckId: string): boolean => {
    if (!isAuthenticated || !authUser) {
      return false;
    }
    if (userProfile?.role === 'admin') {
      return true;
    }
    const truck = [...supabaseOwnedTrucks, ...foodTrucks].find(t => t.id === truckId);
    if (!truck) {
      return false;
    }
    return truck.owner_id === authUser.id;
  }, [isAuthenticated, authUser, userProfile?.role, supabaseOwnedTrucks, foodTrucks]);

  const mapSupabaseTruckToLocal = useCallback((row: any): FoodTruck => {
    if (DEBUG) console.log('[AppContext] mapSupabaseTruckToLocal raw row.id:', row.id, 'raw row.is_open:', row.is_open, '(type:', typeof row.is_open, ')');
    const galleryImages = parseJsonArray(row.gallery_images);
    const menuImages = parseJsonArray(row.menu_images);
    if (DEBUG) console.log('[AppContext] mapSupabaseTruckToLocal gallery_images count:', galleryImages.length, 'menu_images count:', menuImages.length);
    return {
      id: row.id?.toString() ?? '',
      name: row.name ?? '',
      owner_id: row.owner_id ?? '',
      hero_image: typeof row.hero_image === 'string' && row.hero_image.trim().length > 0 ? row.hero_image.trim() : DEFAULT_TRUCK_HERO_IMAGE,
      logo: typeof row.logo === 'string' && row.logo.trim().length > 0 ? row.logo.trim() : DEFAULT_TRUCK_LOGO_IMAGE,
      cuisine_type: row.cuisine_type ?? 'Unspecified',
      menu_images: menuImages,
      images: galleryImages,
      open_now: row.is_open ?? false,
      location: {
        latitude: typeof row.latitude === 'number' ? row.latitude : Number.NaN,
        longitude: typeof row.longitude === 'number' ? row.longitude : Number.NaN,
        address: row.address ?? row.label ?? '',
      },
      hours: 'Not set',
      bio: row.bio ?? row.description ?? '',
      phone: row.phone ?? '',
      website: row.website ?? '',
      facebook_url: row.facebook_url ?? '',
      instagram_url: row.instagram_url ?? '',
      tiktok_url: row.tiktok_url ?? '',
      service_area: row.service_area ?? '',
      trust_badges: parseJsonArray(row.trust_badges),
      operatingHours: row.operating_hours ?? undefined,
      verified: false,
      lastUpdated: row.updated_at ?? row.created_at ?? undefined,
      lastLiveUpdatedAt: row.last_live_updated_at ?? row.location_updated_at ?? undefined,
      liveStartedAt: row.live_started_at ?? undefined,
      liveExpiresAt: row.live_expires_at ?? undefined,
      liveSource: row.live_source ?? undefined,
      search_keywords: [],
      analytics: undefined,
      archived: row.archived === true,
      archivedAt: typeof row.archived_at === 'string' ? row.archived_at : undefined,
      archiveReason: row.archive_reason ?? undefined,
      is_test: row.is_test === true,
      lastOwnerActivityAt:
        typeof row.last_owner_activity_at === 'string'
          ? Date.parse(row.last_owner_activity_at)
          : typeof row.last_owner_activity_at === 'number'
          ? row.last_owner_activity_at
          : undefined,
      created_at: typeof row.created_at === 'string' ? row.created_at : undefined,
    };
  }, []);

  const mergeTruckLocations = useCallback((trucks: FoodTruck[], locationRows: LocationRow[] | null | undefined): FoodTruck[] => {
    if (!locationRows || locationRows.length === 0) {
      return trucks;
    }

    const locationsByTruckId = new Map<string, LocationRow>();
    for (const row of locationRows) {
      if (row?.truck_id) {
        locationsByTruckId.set(row.truck_id.toString(), row);
      }
    }

    return trucks.map((truck) => {
      const locationRow = locationsByTruckId.get(truck.id);
      if (!locationRow) {
        return truck;
      }
      const locationFreshnessTimestamp = truck.lastLiveUpdatedAt
        ?? (truck.open_now ? undefined : locationRow.updated_at ?? locationRow.created_at)
        ?? truck.lastUpdated;

      return {
        ...truck,
        location: {
          latitude: locationRow.latitude ?? truck.location.latitude,
          longitude: locationRow.longitude ?? truck.location.longitude,
          address: locationRow.label ?? truck.location.address,
        },
        lastLiveUpdatedAt: locationFreshnessTimestamp,
      };
    });
  }, []);

  const fetchTruckLocationRows = useCallback(async (truckIds: string[], source: string): Promise<LocationRow[] | null> => {
    if (truckIds.length === 0) return null;

    const primaryLocationResult = await supabase
      .from('locations')
      .select('truck_id, latitude, longitude, label, updated_at')
      .in('truck_id', truckIds);
    let data = primaryLocationResult.data as LocationRow[] | null;
    let error = primaryLocationResult.error;

    if (isMissingUpdatedAtError(error?.message)) {
      const fallback = await supabase
        .from('locations')
        .select('truck_id, latitude, longitude, label, created_at')
        .in('truck_id', truckIds);

      data = fallback.data as LocationRow[] | null;
      error = fallback.error;
    }

    if (error) {
      console.log(`[AppContext] Supabase fetch ${source} locations error:`, error.message);
      return null;
    }

    if (__DEV__) {
      console.log(`[AppContext] ${source} locations fetched:`, {
        requestedTruckCount: truckIds.length,
        locationRowCount: data?.length ?? 0,
      });
    }

    return data as LocationRow[] | null;
  }, []);
  
  const fetchReviewsFromSupabase = useCallback(async () => {
  if (!isSupabaseConfigured) {
    if (DEBUG) console.log('[AppContext] Supabase not configured, no reviews to fetch');
    setReviews([]);
    return;
  }

  if (DEBUG) console.log('[AppContext] Fetching reviews from Supabase');

  try {
    const { data: reviewRows, error: reviewError } = await supabase
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (reviewError) {
      console.log('[AppContext] Supabase fetch reviews error:', reviewError.message);
      setReviews([]);
      return;
    }

    const userIds = Array.from(
      new Set((reviewRows ?? []).map((row: any) => row.user_id).filter(Boolean))
    );

    let profilesById: Record<string, { display_name?: string; profile_photo?: string }> = {};

    if (userIds.length > 0) {
      const { data: profileRows, error: profileError } = await supabase
        .from('profiles')
        .select('id, display_name, profile_photo')
        .in('id', userIds);

      if (profileError) {
        console.log('[AppContext] Supabase fetch review profiles error:', profileError.message);
      } else {
        profilesById = (profileRows ?? []).reduce((acc: Record<string, any>, profile: any) => {
          acc[profile.id] = {
            display_name: profile.display_name,
            profile_photo: profile.profile_photo,
          };
          return acc;
        }, {});
      }
    }

    const reviewIds = (reviewRows ?? [])
      .map((row: any) => row.id?.toString?.() ?? '')
      .filter(Boolean);
    let repliesByReviewId: Record<string, ReviewReply> = {};

    if (reviewIds.length > 0) {
      const { data: replyRows, error: replyError } = await supabase
        .from('review_replies')
        .select('id, review_id, truck_id, body, created_at, updated_at')
        .in('review_id', reviewIds)
        .is('deleted_at', null);

      if (replyError) {
        if (isMissingRelationError(replyError.message)) {
          console.log('[AppContext] Review replies table not available yet');
        } else {
          console.log('[AppContext] Supabase fetch review replies error:', replyError.message);
        }
      } else {
        repliesByReviewId = (replyRows ?? []).reduce((acc: Record<string, ReviewReply>, reply: any) => {
          const reviewId = reply.review_id?.toString?.() ?? '';
          if (!reviewId) return acc;

          acc[reviewId] = {
            id: reply.id?.toString() ?? '',
            reviewId,
            truckId: reply.truck_id?.toString?.() ?? '',
            body: reply.body ?? '',
            createdAt: reply.created_at ? String(reply.created_at) : new Date().toISOString(),
            updatedAt: reply.updated_at ? String(reply.updated_at) : new Date().toISOString(),
          };
          return acc;
        }, {});
      }
    }

    const mappedReviews = (reviewRows ?? []).map((row: any) => {
  const userId = row.user_id?.toString() ?? '';
  const profile = profilesById[userId];
  const reviewId = row.id?.toString() ?? '';

  return {
    id: reviewId,
    truckId: row.truck_id?.toString() ?? '',
    rating: typeof row.rating === 'number' ? row.rating : Number(row.rating) || 0,
    text: row.text ?? '',
    createdAt: row.created_at
      ? String(row.created_at)
      : new Date().toISOString(),
    user: {
      id: userId,
      name: profile?.display_name || 'Food Truck Fan',
      profile_photo: profile?.profile_photo ?? null,
    },
    ownerReply: repliesByReviewId[reviewId] ?? null,
  };
}) as Review[];
    setReviews(mappedReviews);

    if (DEBUG) {
      console.log('[AppContext] Fetched', mappedReviews.length, 'reviews from Supabase');
    }
  } catch (err: any) {
    console.log('[AppContext] Unexpected error fetching reviews:', err?.message);
    setReviews([]);
  }
}, []);

  const fetchUpcomingStopsFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Supabase not configured, no upcoming stops to fetch');
      setUpcomingStops([]);
      setUpcomingStopsLoading(false);
      return;
    }

    if (DEBUG) console.log('[AppContext] Fetching upcoming stops from Supabase');
    setUpcomingStopsLoading(true);
    try {
      const { data, error } = await supabase
        .from('upcoming_stops')
        .select('*')
        .order('starts_at', { ascending: true });

      if (error) {
        console.log('[AppContext] Supabase fetch upcoming stops error:', error.message);
        setUpcomingStops([]);
        return;
      }

      setUpcomingStops((data ?? []).map(mapUpcomingStopRow));
      if (DEBUG) console.log('[AppContext] Fetched', data?.length ?? 0, 'upcoming stops');
    } catch (err: any) {
      console.log('[AppContext] Unexpected error fetching upcoming stops:', err?.message);
      setUpcomingStops([]);
    } finally {
      setUpcomingStopsLoading(false);
    }
  }, []);

  const fetchAllTrucksFromSupabase = useCallback(async () => {
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Supabase not configured, no trucks to fetch');
      setFoodTrucks([]);
      setAllTrucksLoading(false);
      return;
    }

    if (DEBUG) console.log('[AppContext] Fetching all trucks from Supabase');
    setAllTrucksLoading(true);
    try {
      const { data, error } = await supabase
        .from('trucks')
        .select('*');

      if (error) {
        console.log('[AppContext] Supabase fetch all trucks error:', error.message);
        setFoodTrucks([]);
      } else {
        const mapped = (data ?? []).map(mapSupabaseTruckToLocal);
        const truckIds = mapped.map((truck) => truck.id).filter(Boolean);
        let merged = mapped;

        if (truckIds.length > 0) {
          const locationRows = await fetchTruckLocationRows(truckIds, 'all truck');
          merged = mergeTruckLocations(mapped, locationRows);
        }

        if (DEBUG) console.log('[AppContext] Fetched', merged.length, 'trucks from Supabase');
        if (__DEV__) {
          const validLocationCount = merged.filter(truck =>
            Number.isFinite(truck.location?.latitude) && Number.isFinite(truck.location?.longitude)
          ).length;
          console.log('[AppContext] all truck location merge result:', {
            truckCount: merged.length,
            validLocationCount,
            invalidLocationCount: merged.length - validLocationCount,
          });
        }
        setFoodTrucks(merged);

        const extractedMenuItems: MenuItem[] = [];
        const extractedAnnouncements: Announcement[] = [];
        (data ?? []).forEach((row: any) => {
          const items = parseJsonArray(row.menu_items);
          items.forEach((item: any) => {
            if (item?.id) {
              extractedMenuItems.push({
                id: item.id,
                truck_id: row.id?.toString() ?? '',
                name: item.name ?? '',
                description: item.description ?? '',
                price: typeof item.price === 'number' ? item.price : 0,
                category: item.category,
                image: item.image,
                available: item.available !== false,
              });
            }
          });

          const anns = parseJsonArray(row.announcements);
          anns.forEach((ann: any) => {
            if (ann?.id) {
              extractedAnnouncements.push({
                id: ann.id,
                truck_id: row.id?.toString() ?? '',
                message: ann.message ?? '',
                timestamp: ann.timestamp ?? new Date().toISOString(),
                expires_at: ann.expires_at,
              });
            }
          });
        });
        if (DEBUG) console.log('[AppContext] Extracted', extractedMenuItems.length, 'menu items,', extractedAnnouncements.length, 'announcements');
        setMenuItems(extractedMenuItems);
        setAnnouncements(extractedAnnouncements);
      }
    } catch (err: any) {
      console.log('[AppContext] Unexpected error fetching all trucks:', err?.message);
      setFoodTrucks([]);
    } finally {
      setAllTrucksLoading(false);
    }
  }, [fetchTruckLocationRows, mapSupabaseTruckToLocal, mergeTruckLocations]);

  const fetchOwnedTrucksFromSupabase = useCallback(async () => {
    if (!isAuthenticated || !authUser || !isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Skipping owned truck fetch');
      setSupabaseOwnedTrucks([]);
      setIsOwnerLoading(false);
      return;
    }

    if (DEBUG) console.log('[AppContext] Fetching owned trucks for owner_id:', authUser.id);
    if (__DEV__) {
      console.log('[AppContext] owned truck refresh started:', {
        ownerId: authUser.id,
        selectedAdminTruckId: selectedAdminTruckIdRef.current,
      });
    }
    setIsOwnerLoading(true);
    try {
      const { data, error } = await supabase
        .from('trucks')
        .select('*')
        .eq('owner_id', authUser.id);

      if (error) {
        console.log('[AppContext] Supabase fetch owned trucks error:', error.message);
        setSupabaseOwnedTrucks([]);
      } else {
        const mapped = (data ?? []).map(mapSupabaseTruckToLocal);
        const truckIds = mapped.map((truck) => truck.id).filter(Boolean);
        let merged = mapped;

        if (truckIds.length > 0) {
          const locationRows = await fetchTruckLocationRows(truckIds, 'owned truck');
          merged = mergeTruckLocations(mapped, locationRows);
        }

        if (DEBUG) console.log('[AppContext] Fetched', merged.length, 'owned trucks');
        if (__DEV__) {
          const validLocationCount = merged.filter(truck =>
            Number.isFinite(truck.location?.latitude) && Number.isFinite(truck.location?.longitude)
          ).length;
          console.log('[AppContext] owned truck refresh result:', {
            ownerId: authUser.id,
            count: merged.length,
            ids: merged.map(truck => truck.id),
            validLocationCount,
            invalidLocationCount: merged.length - validLocationCount,
            selectedAdminTruckId: selectedAdminTruckIdRef.current,
          });
        }
        setSupabaseOwnedTrucks(merged);
      }
    } catch (err: any) {
      console.log('[AppContext] Unexpected error fetching owned trucks:', err?.message);
      setSupabaseOwnedTrucks([]);
    } finally {
      setIsOwnerLoading(false);
    }
  }, [fetchTruckLocationRows, isAuthenticated, authUser, mapSupabaseTruckToLocal, mergeTruckLocations]);

  const refreshOwnedTrucks = useCallback(async () => {
    await fetchOwnedTrucksFromSupabase();
    await fetchAllTrucksFromSupabase();
  }, [fetchOwnedTrucksFromSupabase, fetchAllTrucksFromSupabase]);
  
  useEffect(() => {
    void fetchReviewsFromSupabase();

    if (!isSupabaseConfigured) {
      return;
    }

    const reviewChannel = supabase
      .channel('reviews-refresh')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reviews' },
        () => {
          void fetchReviewsFromSupabase();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'review_replies' },
        () => {
          void fetchReviewsFromSupabase();
        }
      )
      .subscribe();

    return () => {
      void reviewChannel.unsubscribe();
    };
  }, [fetchReviewsFromSupabase]);

  useEffect(() => {
    void fetchAllTrucksFromSupabase();
  }, [fetchAllTrucksFromSupabase]);

  useEffect(() => {
    void fetchUpcomingStopsFromSupabase();
  }, [fetchUpcomingStopsFromSupabase]);

  useEffect(() => {
    void fetchOwnedTrucksFromSupabase();
  }, [fetchOwnedTrucksFromSupabase]);

  useEffect(() => {
    const fetchTruckCheckInAnalytics = async () => {
      if (!isAuthenticated || !authUser || !isSupabaseConfigured) {
        setTruckCheckInAnalytics({});
        return;
      }

      const ownedTruckIds = (supabaseOwnedTrucks.length > 0
        ? supabaseOwnedTrucks
        : foodTrucks.filter(truck => truck.owner_id === authUser.id)
      ).map(truck => truck.id);

      if (ownedTruckIds.length === 0) {
        setTruckCheckInAnalytics({});
        return;
      }

      const now = new Date();
      const monthStart = `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, '0')}-01`;

      const entries = await Promise.all(
        ownedTruckIds.map(async (truckId) => {
          const [{ count: allTimeCount, error: allTimeError }, { count: monthCount, error: monthError }] =
            await Promise.all([
              supabase
                .from('truck_checkins')
                .select('*', { count: 'exact', head: true })
                .eq('truck_id', truckId),
              supabase
                .from('truck_checkins')
                .select('*', { count: 'exact', head: true })
                .eq('truck_id', truckId)
                .gte('checkin_date', monthStart),
            ]);

          if (allTimeError || monthError) {
            console.log('[AppContext] Error fetching check-in analytics:', allTimeError?.message || monthError?.message);
          }

          return [
            truckId,
            {
              allTime: allTimeError ? 0 : allTimeCount ?? 0,
              thisMonth: monthError ? 0 : monthCount ?? 0,
            },
          ] as const;
        })
      );

      setTruckCheckInAnalytics(Object.fromEntries(entries));
    };

    void fetchTruckCheckInAnalytics();
  }, [authUser, foodTrucks, isAuthenticated, supabaseOwnedTrucks]);

  useEffect(() => {
    const syncAuthWithUserProfile = async () => {
      if (authLoading) {
        if (DEBUG) console.log('[AppContext] Waiting for auth to load');
        return;
      }

      if (isAuthenticated && authUser) {
        if (DEBUG) console.log('[AppContext] Hydrating customer profile from Supabase');
        let storedFavorites: string[] = [];
        let storedRole: User['role'] = 'customer';
        let storedTruckId: string | undefined;
        let storedProfilePhoto: string | undefined;

        try {
          // Load stored favorites if available (for immediate UI availability)
          const storedProfile = await AsyncStorage.getItem('userProfile');
          if (storedProfile) {
            try {
              const cached = JSON.parse(storedProfile);
              if (cached.id === authUser.id) {
                if (Array.isArray(cached.favorites)) {
                  storedFavorites = cached.favorites;
                }
                storedRole = normalizeUserRole(cached.role);
                if (typeof cached.truck_id === 'string' && cached.truck_id.length > 0) {
                  storedTruckId = cached.truck_id;
                }
                if (typeof cached.profile_photo === 'string' && cached.profile_photo.length > 0) {
                  storedProfilePhoto = cached.profile_photo;
                }
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          // Try to fetch from Supabase profiles table
          if (isSupabaseConfigured) {
            const { data: profileData, error } = await supabase
              .from('profiles')
              .select('display_name, profile_photo, role, truck_id')
              .eq('id', authUser.id)
              .single();

            console.log('[AppContext] Raw profile data from Supabase:', profileData);

            let supabaseFavorites = storedFavorites;

const { data: favoriteRows, error: favoritesError } = await supabase
  .from('favorites')
  .select('truck_id')
  .eq('user_id', authUser.id);

if (!favoritesError && favoriteRows) {
  supabaseFavorites = favoriteRows.map(row => row.truck_id);
}

            if (!error && profileData) {
              if (DEBUG) console.log('[AppContext] Loaded customer profile from Supabase');
              const newProfile: User = {
                id: authUser.id,
                name: profileData.display_name || authUser.name,
                email: authUser.email,
                profile_photo: profileData.profile_photo || storedProfilePhoto,
                role: normalizeUserRole(profileData.role),
                truck_id: profileData.truck_id || storedTruckId,
                favorites: supabaseFavorites,
              };
              setUserProfile(newProfile);
              await AsyncStorage.setItem('userProfile', JSON.stringify(newProfile));
              return;
            } else if (error && error.code !== 'PGRST116') {
              // PGRST116 = not found, which is expected for new users
              console.log('[AppContext] Profile fetch error:', error.message);
            }
          }
          
          if (DEBUG) console.log('[AppContext] Falling back to auth profile values');
          const newProfile: User = {
            id: authUser.id,
            name: authUser.name,
            email: authUser.email,
            profile_photo: storedProfilePhoto,
            role: storedRole,
            truck_id: storedTruckId,
            favorites: storedFavorites,
          };
          setUserProfile(newProfile);
          await AsyncStorage.setItem('userProfile', JSON.stringify(newProfile));
        } catch (err: any) {
          console.log('[AppContext] Error hydrating profile:', err?.message);
          // Fall back to basic profile on error
          const newProfile: User = {
            id: authUser.id,
            name: authUser.name,
            email: authUser.email,
            profile_photo: storedProfilePhoto,
            role: storedRole,
            truck_id: storedTruckId,
            favorites: storedFavorites,
          };
          setUserProfile(newProfile);
          await AsyncStorage.setItem('userProfile', JSON.stringify(newProfile));
        }
      } else if (!isAuthenticated) {
        if (__DEV__) {
          console.log('[AppContext] Clearing user profile:', {
            file: 'contexts/AppContext.tsx',
            functionName: 'syncAuthWithUserProfile',
            reason: 'Auth state is unauthenticated after auth loading completed',
            userId: authUser?.id ?? userProfile?.id ?? null,
            email: authUser?.email ?? userProfile?.email ?? null,
            sessionExists: isAuthenticated,
          });
        }
        setUserProfile(null);
        if (DEBUG) console.log('[AppContext] Cleared user profile');
      }
    };
    
    void syncAuthWithUserProfile();
  }, [isAuthenticated, authUser, authLoading, userProfile?.email, userProfile?.id]);

  useEffect(() => {
    const hydrateSettings = async () => {
      try {
        const [storedShowClosed, storedCustomerRadius, storedExploreMode, storedExploreCenter, storedLastViewedOwnerUpdates] = await Promise.all([
          AsyncStorage.getItem('showClosed'),
          AsyncStorage.getItem('customerRadius'),
          AsyncStorage.getItem('exploreMode'),
          AsyncStorage.getItem('exploreCenter'),
          AsyncStorage.getItem('lastViewedOwnerUpdates'),
        ]);

        if (storedShowClosed) setShowClosedState(JSON.parse(storedShowClosed));
        if (storedCustomerRadius) setCustomerRadiusState(JSON.parse(storedCustomerRadius));
        if (storedExploreMode) setExploreModeState(JSON.parse(storedExploreMode));
        if (storedExploreCenter) setExploreCenterState(JSON.parse(storedExploreCenter));
        if (storedLastViewedOwnerUpdates) setLastViewedOwnerUpdates(JSON.parse(storedLastViewedOwnerUpdates));

        const storedQrShared = await AsyncStorage.getItem('qrShared');
        if (storedQrShared === 'true') setQrShared(true);

        if (DEBUG) console.log('[AppContext] Settings hydrated from storage');
      } catch (error) {
        console.log('Error hydrating settings from storage:', error);
      }
    };

    void hydrateSettings();
  }, []);

  const dismissChecklist = useCallback(() => {
    setChecklistDismissed(true);
    void AsyncStorage.setItem('checklistDismissed', 'true');
  }, []);

  const markQrShared = useCallback(() => {
    setQrShared(true);
    void AsyncStorage.setItem('qrShared', 'true');
    if (DEBUG) console.log('[AppContext] markQrShared persisted');
  }, []);

  const hasHoursSet = useCallback((truckId: string) => {
    const truck = foodTrucks.find(t => t.id === truckId);
    if (!truck?.operatingHours) return false;
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days.some(day => truck.operatingHours && truck.operatingHours[day] && !truck.operatingHours[day].closed);
  }, [foodTrucks]);

  const currentUser = userProfile;

  const setCurrentUser = useCallback((user: User) => {
    setUserProfile(user);
    void AsyncStorage.setItem('userProfile', JSON.stringify(user));
  }, []);

  const completeOnboarding = useCallback(() => {
    setIsOnboarded(true);
    void AsyncStorage.setItem('isOnboarded', 'true');
  }, []);

  const refreshCustomerProfile = useCallback(async (): Promise<void> => {
    if (!isAuthenticated || !authUser || authLoading) {
      if (DEBUG) console.log('[AppContext] refreshCustomerProfile blocked - auth not ready');
      return;
    }

    if (DEBUG) console.log('[AppContext] Refreshing customer profile from Supabase');
    
    try {
      // Preserve current favorites
      let currentFavorites = userProfile?.favorites || [];
      
      // Try to fetch from Supabase profiles table
      if (isSupabaseConfigured) {
        const { data: favoriteRows, error: favoritesError } = await supabase
          .from('favorites')
          .select('truck_id')
          .eq('user_id', authUser.id);

        if (favoritesError) {
          console.log('[AppContext] Favorites refresh error:', favoritesError.message);
        } else if (favoriteRows) {
          currentFavorites = favoriteRows.map((row: any) => row.truck_id).filter(Boolean);
        }

        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('display_name, profile_photo, role, truck_id')
          .eq('id', authUser.id)
          .single();

        console.log('[AppContext] Raw refreshed profile data from Supabase:', profileData);

        if (!error && profileData) {
          if (DEBUG) console.log('[AppContext] Refreshed customer profile from Supabase');
          const refreshedProfile: User = {
            id: authUser.id,
            name: profileData.display_name || authUser.name,
            email: authUser.email,
            profile_photo: profileData.profile_photo || userProfile?.profile_photo,
            role: normalizeUserRole(profileData.role),
            truck_id: profileData.truck_id || userProfile?.truck_id,
            favorites: currentFavorites,
          };
          setUserProfile(refreshedProfile);
          await AsyncStorage.setItem('userProfile', JSON.stringify(refreshedProfile));
          return;
        } else if (error && error.code !== 'PGRST116') {
          console.log('[AppContext] Profile refresh error:', error.message);
        }
      }
      
      // Fallback: use current auth user info
      if (DEBUG) console.log('[AppContext] Refreshing with auth fallback values');
      const fallbackProfile: User = {
        id: authUser.id,
        name: authUser.name,
        email: authUser.email,
        profile_photo: userProfile?.profile_photo,
        role: normalizeUserRole(userProfile?.role),
        truck_id: userProfile?.truck_id,
        favorites: currentFavorites,
      };
      setUserProfile(fallbackProfile);
      await AsyncStorage.setItem('userProfile', JSON.stringify(fallbackProfile));
    } catch (err: any) {
      console.log('[AppContext] Error refreshing profile:', err?.message);
    }
  }, [isAuthenticated, authUser, authLoading, userProfile, isSupabaseConfigured]);

  const refreshOnForeground = useCallback(async (previousState: string, nextState: string) => {
    const now = Date.now();

    if (suppressForegroundRefreshRef.current > 0) {
      lastForegroundRefreshAtRef.current = now;
      if (__DEV__) {
        console.log('[AppContext] Foreground refresh skipped - image picker active:', {
          previousState,
          nextState,
          suppressCount: suppressForegroundRefreshRef.current,
        });
      }
      return;
    }

    if (foregroundRefreshInFlightRef.current) {
      if (__DEV__) {
        console.log('[AppContext] Foreground refresh skipped - already running:', {
          previousState,
          nextState,
        });
      }
      return;
    }

    if (now - lastForegroundRefreshAtRef.current < FOREGROUND_REFRESH_DEBOUNCE_MS) {
      if (__DEV__) {
        console.log('[AppContext] Foreground refresh skipped - debounced:', {
          previousState,
          nextState,
        });
      }
      return;
    }

    lastForegroundRefreshAtRef.current = now;
    foregroundRefreshInFlightRef.current = true;

    if (__DEV__) {
      console.log('[AppContext] Foreground refresh started:', {
        previousState,
        nextState,
        authenticated: isAuthenticated,
      });
    }

    try {
      if (isSupabaseConfigured && isAuthenticated && authUser) {
        const { error } = await supabase.auth.refreshSession();
        if (error) {
          console.log('[AppContext] Foreground session refresh error:', error.message);
        }
      }

      const refreshTasks: Promise<void>[] = [
        fetchAllTrucksFromSupabase(),
        fetchReviewsFromSupabase(),
        fetchUpcomingStopsFromSupabase(),
      ];

      if (isAuthenticated && authUser) {
        refreshTasks.push(refreshCustomerProfile());
        refreshTasks.push(fetchOwnedTrucksFromSupabase());
      }

      const results = await Promise.allSettled(refreshTasks);
      const rejected = results.filter((result) => result.status === 'rejected');

      if (rejected.length > 0) {
        console.log('[AppContext] Foreground refresh errors:', rejected);
      }

      if (__DEV__) {
        console.log('[AppContext] Foreground refresh completed:', {
          previousState,
          nextState,
          errors: rejected.length,
        });
      }
    } catch (error) {
      console.log('[AppContext] Foreground refresh error:', error);
    } finally {
      foregroundRefreshInFlightRef.current = false;
    }
  }, [
    authUser,
    fetchAllTrucksFromSupabase,
    fetchOwnedTrucksFromSupabase,
    fetchReviewsFromSupabase,
    fetchUpcomingStopsFromSupabase,
    isAuthenticated,
    refreshCustomerProfile,
  ]);

  useEffect(() => {
    const subscription = RNAppState.addEventListener('change', (nextState) => {
      const previousState = appStateRef.current;

      if (__DEV__) {
        console.log('[AppContext] AppState changed:', {
          previousState,
          nextState,
        });
      }

      appStateRef.current = nextState;

      if (/inactive|background/.test(previousState) && nextState === 'active') {
        if (suppressForegroundRefreshRef.current > 0) {
          lastForegroundRefreshAtRef.current = Date.now();
          if (__DEV__) {
            console.log('[AppContext] AppState active ignored for image picker return:', {
              previousState,
              nextState,
              suppressCount: suppressForegroundRefreshRef.current,
            });
          }
          return;
        }
        void refreshOnForeground(previousState, nextState);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [refreshOnForeground]);

  const toggleFavorite = useCallback(async (truckId: string) => {
  if (authLoading) {
    if (DEBUG) console.log('[AppContext] toggleFavorite blocked - auth loading');
    return;
  }

  if (!isAuthenticated || !authUser) {
    if (DEBUG) console.log('[AppContext] toggleFavorite requires auth');
    return;
  }

  const userId = authUser.id;

  const currentFavorites = userProfile?.favorites ?? [];
  const isFavorite = currentFavorites.includes(truckId);

  // Optimistic UI update
  setUserProfile(prev => {
    if (!prev) {
      const newProfile: User = {
        id: authUser.id,
        name: authUser.name,
        role: 'customer' as const,
        favorites: [truckId],
      };
      void AsyncStorage.setItem('userProfile', JSON.stringify(newProfile));
      return newProfile;
    }

    const updatedFavorites = isFavorite
      ? prev.favorites.filter(id => id !== truckId)
      : [...prev.favorites, truckId];

    const updated = { ...prev, favorites: updatedFavorites };
    void AsyncStorage.setItem('userProfile', JSON.stringify(updated));
    return updated;
  });

  try {
    if (isFavorite) {
      const { error } = await supabase
        .from('favorites')
        .delete()
        .eq('user_id', userId)
        .eq('truck_id', truckId);

      if (error) throw error;

      void trackEvent({
        event_type: 'favorite_removed',
        truck_id: truckId,
        user_id: userId,
      });

      if (DEBUG) console.log('[AppContext] favorite removed from Supabase:', { userId, truckId });
    } else {
     const { error } = await supabase
  .from('favorites')
  .insert({
    user_id: userId,
    truck_id: truckId,
  });

if (error) {
  const message = error.message?.toLowerCase?.() || '';

  if (
    message.includes('duplicate key value') ||
    message.includes('favorites_user_id_truck_id_key')
  ) {
    console.log('[AppContext] Favorite already exists in Supabase, refreshing local state');
  } else {
    throw error;
  }
}

      void trackEvent({
        event_type: 'favorite_added',
        truck_id: truckId,
        user_id: userId,
      });
      const currentRole = userProfile?.role as string | undefined;
      if (currentRole !== 'owner' && currentRole !== 'admin') {
        void recordReviewEngagement('favorite_added', {
          truckId,
          userId,
        });
      }

      if (DEBUG) console.log('[AppContext] favorite added to Supabase:', { userId, truckId });
    }
  } catch (error: any) {
    console.error('[AppContext] toggleFavorite Supabase error:', error?.message || error);

    // Revert optimistic update if DB write fails
    setUserProfile(prev => {
      if (!prev) return prev;

      const revertedFavorites = isFavorite
        ? [...prev.favorites, truckId]
        : prev.favorites.filter(id => id !== truckId);

      const reverted = { ...prev, favorites: revertedFavorites };
      void AsyncStorage.setItem('userProfile', JSON.stringify(reverted));
      return reverted;
    });
  }
}, [authLoading, isAuthenticated, authUser, userProfile, setUserProfile]);



  const setShowClosed = useCallback((value: boolean) => {
    setShowClosedState(value);
    void AsyncStorage.setItem('showClosed', JSON.stringify(value));
  }, []);

  const setCustomerRadius = useCallback((value: number) => {
    setCustomerRadiusState(value);
    void AsyncStorage.setItem('customerRadius', JSON.stringify(value));
  }, []);

  const setExploreMode = useCallback((value: boolean) => {
    setExploreModeState(value);
    void AsyncStorage.setItem('exploreMode', JSON.stringify(value));
  }, []);

  const setExploreCenter = useCallback((center: { latitude: number; longitude: number; label?: string } | null) => {
    setExploreCenterState(center);
    void AsyncStorage.setItem('exploreCenter', JSON.stringify(center));
  }, []);



  const addTruckImage = useCallback((truckId: string, imageUrl: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => 
        truck.id === truckId 
          ? { ...truck, images: [...truck.images, imageUrl] } 
          : truck
      )
    );
  }, []);

  const removeTruckImage = useCallback((truckId: string, imageUrl: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => 
        truck.id === truckId 
          ? { ...truck, images: truck.images.filter(img => img !== imageUrl) } 
          : truck
      )
    );
  }, []);

  const upsertTruckLiveLocation = useCallback(async (
    truckId: string,
    location: FoodTruck['location'],
    updatedAtIso: string
  ) => {
    const locationPayload = {
      truck_id: truckId,
      latitude: location.latitude,
      longitude: location.longitude,
      label: location.address,
      updated_at: updatedAtIso,
    };

    if (__DEV__) {
      console.log('[AppContext] Upserting live location:', {
        truckId,
        latitude: locationPayload.latitude,
        longitude: locationPayload.longitude,
        hasLabel: Boolean(locationPayload.label?.trim()),
        updatedAt: locationPayload.updated_at,
      });
    }

    let locationWrite = await supabase
      .from('locations')
      .upsert(
        locationPayload,
        { onConflict: 'truck_id' }
      )
      .select('truck_id, latitude, longitude, label, updated_at');

    if (isMissingUpdatedAtError(locationWrite.error?.message)) {
      const legacyLocationPayload = {
        truck_id: locationPayload.truck_id,
        latitude: locationPayload.latitude,
        longitude: locationPayload.longitude,
        label: locationPayload.label,
      };
      locationWrite = await supabase
        .from('locations')
        .upsert(
          legacyLocationPayload,
          { onConflict: 'truck_id' }
        )
        .select('truck_id, latitude, longitude, label, created_at');
    }

    const locationWriteErrorMessage = locationWrite.error?.message;
    if (locationWriteErrorMessage && isMissingLocationConflictTargetError(locationWriteErrorMessage)) {
      if (__DEV__) {
        console.log('[AppContext] Location upsert conflict target unavailable; falling back to update/insert:', {
          truckId,
          error: locationWriteErrorMessage,
        });
      }

      let locationUpdate = await supabase
        .from('locations')
        .update(locationPayload)
        .eq('truck_id', truckId)
        .select('truck_id, latitude, longitude, label, updated_at');

      if (isMissingUpdatedAtError(locationUpdate.error?.message)) {
        const legacyLocationPayload = {
          truck_id: locationPayload.truck_id,
          latitude: locationPayload.latitude,
          longitude: locationPayload.longitude,
          label: locationPayload.label,
        };
        locationUpdate = await supabase
          .from('locations')
          .update(legacyLocationPayload)
          .eq('truck_id', truckId)
          .select('truck_id, latitude, longitude, label, created_at');
      }

      if (!locationUpdate.error && (locationUpdate.data?.length ?? 0) > 0) {
        locationWrite = locationUpdate;
      } else if (!locationUpdate.error) {
        locationWrite = await supabase
          .from('locations')
          .insert(locationPayload)
          .select('truck_id, latitude, longitude, label, updated_at');

        if (isMissingUpdatedAtError(locationWrite.error?.message)) {
          const legacyLocationPayload = {
            truck_id: locationPayload.truck_id,
            latitude: locationPayload.latitude,
            longitude: locationPayload.longitude,
            label: locationPayload.label,
          };
          locationWrite = await supabase
            .from('locations')
            .insert(legacyLocationPayload)
            .select('truck_id, latitude, longitude, label, created_at');
        }
      } else {
        locationWrite = locationUpdate;
      }
    }

    if (__DEV__) {
      console.log('[AppContext] Supabase location write result:', {
        truckId,
        rows: locationWrite.data?.length ?? 0,
        error: locationWrite.error?.message ?? null,
      });
    }

    return locationWrite;
  }, []);

   const updateTruckDetails = useCallback(async (truckId: string, updates: Partial<FoodTruck>) => {
  const isArchiveUpdate = Object.prototype.hasOwnProperty.call(updates, 'archived');
  const isArchiving = updates.archived === true;
  const isGoLiveUpdate = updates.open_now === true && !!updates.location;
  const savedAt = new Date().toISOString();
  const sanitizedUpdates = sanitizeTruckUpdatesForPersistence(updates);
  const skippedEmptyImageFields = (['hero_image', 'logo'] as const).filter(
    key => Object.prototype.hasOwnProperty.call(updates, key) && !Object.prototype.hasOwnProperty.call(sanitizedUpdates, key)
  );

  if (!isAuthenticated || !authUser) {
    if (DEBUG) console.log('[AppContext] blocked - not authenticated');
    throw new Error('Not authenticated');
  }

  if (!userOwnsTruck(truckId)) {
    if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
    throw new Error(`User does not own truck ${truckId}`);
  }

  

  if (DEBUG) console.log('[AppContext] updateTruckDetails for:', truckId, 'keys:', Object.keys(updates));
  if (__DEV__ && (sanitizedUpdates.open_now !== undefined || sanitizedUpdates.location)) {
    const currentLocalTruck = [...supabaseOwnedTrucks, ...foodTrucks].find(truck => truck.id === truckId);
    console.log('[AppContext] Go Live local state before save:', {
      currentUserId: authUser.id,
      truckId,
      openNowBefore: currentLocalTruck?.open_now ?? null,
      latitudeBefore: currentLocalTruck?.location?.latitude ?? null,
      longitudeBefore: currentLocalTruck?.location?.longitude ?? null,
    });
  }
  if (__DEV__ && skippedEmptyImageFields.length > 0) {
    console.log('[AppContext] Preserving existing truck image fields; skipped empty save values:', {
      truckId,
      skippedEmptyImageFields,
    });
  }
  if (__DEV__ && (sanitizedUpdates.open_now !== undefined || sanitizedUpdates.location)) {
    console.log('[AppContext] Go Live update requested:', {
      currentUserId: authUser.id,
      truckId,
      openNow: sanitizedUpdates.open_now,
      hasLocation: Boolean(sanitizedUpdates.location),
      latitude: sanitizedUpdates.location?.latitude ?? null,
      longitude: sanitizedUpdates.location?.longitude ?? null,
      hasLabel: Boolean(sanitizedUpdates.location?.address?.trim()),
    });
  }
  if (__DEV__ && isArchiving) {
    console.log('[AppContext] Archiving truck:', { truckId });
  }

  if (!isGoLiveUpdate) {
    setFoodTrucks(prev =>
      prev.map(truck =>
        truck.id === truckId
          ? {
              ...truck,
              ...sanitizedUpdates,
              lastUpdated: savedAt,
              lastLiveUpdatedAt: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'lastLiveUpdatedAt')
                ? sanitizedUpdates.lastLiveUpdatedAt
                : truck.lastLiveUpdatedAt,
              liveStartedAt: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'liveStartedAt')
                ? sanitizedUpdates.liveStartedAt
                : truck.liveStartedAt,
              liveExpiresAt: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'liveExpiresAt')
                ? sanitizedUpdates.liveExpiresAt
                : truck.liveExpiresAt,
              liveSource: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'liveSource')
                ? sanitizedUpdates.liveSource
                : truck.liveSource,
            }
          : truck
      )
    );
    setSupabaseOwnedTrucks(prev =>
      prev.map(truck =>
        truck.id === truckId
          ? {
              ...truck,
              ...sanitizedUpdates,
              lastUpdated: savedAt,
              lastLiveUpdatedAt: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'lastLiveUpdatedAt')
                ? sanitizedUpdates.lastLiveUpdatedAt
                : truck.lastLiveUpdatedAt,
              liveStartedAt: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'liveStartedAt')
                ? sanitizedUpdates.liveStartedAt
                : truck.liveStartedAt,
              liveExpiresAt: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'liveExpiresAt')
                ? sanitizedUpdates.liveExpiresAt
                : truck.liveExpiresAt,
              liveSource: Object.prototype.hasOwnProperty.call(sanitizedUpdates, 'liveSource')
                ? sanitizedUpdates.liveSource
                : truck.liveSource,
            }
          : truck
      )
    );
  }
    if (__DEV__ && isArchiveUpdate) {
      console.log('[AppContext] Archive local optimistic update:', {
        truckId,
        archived: updates.archived,
      });
    }


    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Supabase not configured, skipping DB write');
      return;
    }

    const dbUpdates = mapAppFieldsToDb(sanitizedUpdates);
    dbUpdates.updated_at = savedAt;

    const persistableKeys = Object.keys(dbUpdates).filter(k => k !== 'updated_at');
    if (DEBUG) console.log('[AppContext] DB payload keys:', persistableKeys.join(', '));
      if (__DEV__) {
        console.log('[AppContext] Truck Supabase update payload:', {
        currentUserId: authUser.id,
        truckId,
        keys: persistableKeys,
        isOpen: dbUpdates.is_open ?? null,
        heroImage: dbUpdates.hero_image ?? '(preserved)',
        logo: dbUpdates.logo ?? '(preserved)',
        galleryImageCount: Array.isArray(dbUpdates.gallery_images) ? dbUpdates.gallery_images.length : undefined,
        menuImageCount: Array.isArray(dbUpdates.menu_images) ? dbUpdates.menu_images.length : undefined,
      });
    }

    if (persistableKeys.length > 0) {
      let updateQuery = supabase
        .from('trucks')
        .update(dbUpdates)
        .eq('id', truckId);

      if (userProfile?.role !== 'admin') {
        updateQuery = updateQuery.eq('owner_id', authUser.id);
      }

      const { error, data } = await updateQuery
        .select();

      if (__DEV__ && isArchiveUpdate) {
        console.log('[AppContext] Archive Supabase update result:', {
          truckId,
          archived: sanitizedUpdates.archived,
          rows: data?.length ?? 0,
          error: error?.message ?? null,
        });
      }
      if (__DEV__ && sanitizedUpdates.open_now !== undefined) {
        console.log('[AppContext] Truck open status update result:', {
          currentUserId: authUser.id,
          truckId,
          openNow: sanitizedUpdates.open_now,
          rows: data?.length ?? 0,
          error: error?.message ?? null,
          returnedIsOpen: data?.[0]?.is_open ?? null,
        });
      }
      if (__DEV__) {
        console.log('[AppContext] Truck Supabase update result:', {
          truckId,
          rows: data?.length ?? 0,
          error: error?.message ?? null,
          returnedHeroImage: data?.[0]?.hero_image ?? null,
          returnedLogo: data?.[0]?.logo ?? null,
          returnedGalleryImageCount: Array.isArray(data?.[0]?.gallery_images) ? data?.[0]?.gallery_images.length : undefined,
        });
      }

      if (error) {
        console.log('[AppContext] Truck update error:', error.message);
        throw new Error(`Failed to update truck: ${error.message}`);
      }
      if ((data?.length ?? 0) === 0) {
        const message = userProfile?.role === 'admin'
          ? 'No truck row was updated.'
          : 'No truck row was updated. This may be an owner permission issue.';
        console.log('[AppContext] Truck update returned zero rows:', {
          currentUserId: authUser.id,
          truckId,
          role: userProfile?.role ?? null,
          ownerFilterApplied: userProfile?.role !== 'admin',
          attemptedOpenNow: sanitizedUpdates.open_now ?? null,
        });
        throw new Error(message);
      }
      if (DEBUG) console.log('[AppContext] Truck update success, rows:', data?.length ?? 0);
    }

    if (sanitizedUpdates.location) {
      const locationWrite = await upsertTruckLiveLocation(truckId, sanitizedUpdates.location, savedAt);

      if (locationWrite.error) {
        console.log('[AppContext] Location upsert error:', locationWrite.error.message);
        throw new Error(`Failed to update location: ${locationWrite.error.message}`);
      }
      if (isGoLiveUpdate && (locationWrite.data?.length ?? 0) === 0) {
        console.log('[AppContext] Location write returned zero rows:', {
          currentUserId: authUser.id,
          truckId,
        });
        throw new Error('Failed to save live location: no location row was written.');
      }

    }


    const { data: refreshedRow, error: fetchErr } = await supabase
      .from('trucks')
      .select('*')
      .eq('id', truckId)
      .single();

    if (fetchErr) {
      console.log('[AppContext] Post-save re-fetch error:', fetchErr.message);
      if (isGoLiveUpdate) {
        throw new Error(`Failed to verify truck after save: ${fetchErr.message}`);
      }
      return;
    }

    if (refreshedRow) {
      let hydrated = mapSupabaseTruckToLocal(refreshedRow);

      const locationResult = await supabase
        .from('locations')
        .select('truck_id, latitude, longitude, label, updated_at')
        .eq('truck_id', truckId)
        .maybeSingle();
      let locationRow = locationResult.data as LocationRow | null;
      let locationFetchError = locationResult.error;

      if (isMissingUpdatedAtError(locationFetchError?.message)) {
        const fallback = await supabase
          .from('locations')
          .select('truck_id, latitude, longitude, label, created_at')
          .eq('truck_id', truckId)
          .maybeSingle();
        locationRow = fallback.data as LocationRow | null;
        locationFetchError = fallback.error;
      }

      if (locationFetchError) {
        console.log('[AppContext] Post-save location fetch error:', locationFetchError.message);
        if (isGoLiveUpdate) {
          throw new Error(`Failed to verify live location after save: ${locationFetchError.message}`);
        }
      } else if (locationRow) {
        hydrated = mergeTruckLocations([hydrated], [locationRow])[0];
      }

      if (isGoLiveUpdate) {
        hydrated = {
          ...hydrated,
          lastUpdated: hydrated.lastUpdated ?? savedAt,
          lastLiveUpdatedAt: hydrated.lastLiveUpdatedAt ?? sanitizedUpdates.lastLiveUpdatedAt ?? savedAt,
          liveStartedAt: hydrated.liveStartedAt ?? sanitizedUpdates.liveStartedAt,
          liveExpiresAt: hydrated.liveExpiresAt ?? sanitizedUpdates.liveExpiresAt,
          liveSource: hydrated.liveSource ?? sanitizedUpdates.liveSource,
        };

        const hasVerifiedLocation =
          Number.isFinite(hydrated.location?.latitude) &&
          Number.isFinite(hydrated.location?.longitude);

        console.log('[AppContext] Go Live post-save verification:', {
          currentUserId: authUser.id,
          truckId,
          refetchedIsOpen: hydrated.open_now,
          hasVerifiedLocation,
          latitude: hydrated.location?.latitude ?? null,
          longitude: hydrated.location?.longitude ?? null,
          lastLiveUpdatedAt: hydrated.lastLiveUpdatedAt ?? null,
          locationFetchError: locationFetchError?.message ?? null,
        });

        if (hydrated.open_now !== true) {
          throw new Error('Truck did not remain open after save. Please try again.');
        }

        if (!hasVerifiedLocation) {
          throw new Error('Live location was not saved with valid coordinates.');
        }
      }

      setFoodTrucks(prev =>
        prev.map(truck =>
          truck.id === truckId ? { ...truck, ...hydrated } : truck
        )
      );
      setSupabaseOwnedTrucks(prev =>
        prev.map(truck =>
          truck.id === truckId ? { ...truck, ...hydrated } : truck
        )
      );
      if (__DEV__) {
        console.log('[AppContext] Post-save truck state refreshed:', {
          truckId,
          selectedAdminTruckId: selectedAdminTruckIdRef.current,
          refreshedOwnerId: hydrated.owner_id,
          authUserId: authUser.id,
          role: userProfile?.role ?? null,
          openNowAfter: hydrated.open_now,
          latitudeAfter: hydrated.location?.latitude ?? null,
          longitudeAfter: hydrated.location?.longitude ?? null,
        });
      }
      if (__DEV__ && isArchiveUpdate) {
        console.log('[AppContext] Archive post-update local state change:', {
          truckId,
          archived: hydrated.archived,
          archivedAt: hydrated.archivedAt,
        });
      }
      if (__DEV__) {
        console.log('[AppContext] Post-save refreshed truck image data:', {
          truckId,
          heroImage: hydrated.hero_image,
          logo: hydrated.logo,
          galleryImageCount: hydrated.images.length,
          menuImageCount: hydrated.menu_images.length,
        });
      }

    }
  }, [isAuthenticated, authUser, userProfile?.role, userOwnsTruck, foodTrucks, supabaseOwnedTrucks, mapSupabaseTruckToLocal, mergeTruckLocations, upsertTruckLiveLocation]);

  // Canonical LIVE-state entry points. The trucks update and the
  // truck_live_events audit insert happen together, inside the
  // go_live_truck / go_offline_truck Postgres RPCs (see
  // supabase/migrations/20260709006000_go_live_offline_rpc.sql), so a
  // partial failure (state changes but no audit row, or vice versa) is
  // no longer possible. See docs/trust-engine.md for the full picture.
  const goLive = useCallback(async ({ truckId, source, location }: GoLiveInput): Promise<void> => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] goLive blocked - not authenticated');
      throw new Error('Not authenticated');
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] goLive blocked - user does not own truck:', truckId);
      throw new Error(`User does not own truck ${truckId}`);
    }
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Supabase not configured, skipping DB write');
      return;
    }

    const liveAt = new Date();
    const liveAtIso = liveAt.toISOString();
    const locationLabel = location?.address?.trim() || null;
    const latitude = Number.isFinite(location?.latitude) ? location.latitude : null;
    const longitude = Number.isFinite(location?.longitude) ? location.longitude : null;

    if (__DEV__) {
      console.log('[AppContext] goLive requested:', {
        truckId,
        source,
        latitude,
        longitude,
        hasAddress: Boolean(locationLabel),
      });
    }

    const { data: rpcRow, error: rpcError } = await supabase.rpc('go_live_truck', {
      p_truck_id: truckId,
      p_source: source,
      p_latitude: latitude,
      p_longitude: longitude,
      p_location_label: locationLabel,
    });

    if (rpcError) {
      console.log('[AppContext] go_live_truck RPC failed:', {
        truckId,
        source,
        error: rpcError.message,
      });
      throw new Error(`Failed to go live: ${rpcError.message}`);
    }
    if (!rpcRow) {
      throw new Error('Failed to go live: truck not found or not authorized.');
    }

    const locationWrite = await upsertTruckLiveLocation(truckId, location, liveAtIso);
    if (locationWrite.error) {
      console.log('[AppContext] Location upsert error:', locationWrite.error.message);
      throw new Error(`Failed to update location: ${locationWrite.error.message}`);
    }

    let hydrated = mapSupabaseTruckToLocal(rpcRow);
    const locationRow = locationWrite.data?.[0] ?? null;
    if (locationRow) {
      hydrated = mergeTruckLocations([hydrated], [locationRow])[0];
    }

    const hasVerifiedLocation =
      Number.isFinite(hydrated.location?.latitude) &&
      Number.isFinite(hydrated.location?.longitude);

    if (__DEV__) {
      console.log('[AppContext] Go Live post-save verification:', {
        currentUserId: authUser.id,
        truckId,
        refetchedIsOpen: hydrated.open_now,
        hasVerifiedLocation,
        latitude: hydrated.location?.latitude ?? null,
        longitude: hydrated.location?.longitude ?? null,
        lastLiveUpdatedAt: hydrated.lastLiveUpdatedAt ?? null,
      });
    }

    if (hydrated.open_now !== true) {
      throw new Error('Truck did not remain open after save. Please try again.');
    }
    if (!hasVerifiedLocation) {
      throw new Error('Live location was not saved with valid coordinates.');
    }

    setFoodTrucks(prev =>
      prev.map(truck => (truck.id === truckId ? { ...truck, ...hydrated } : truck))
    );
    setSupabaseOwnedTrucks(prev =>
      prev.map(truck => (truck.id === truckId ? { ...truck, ...hydrated } : truck))
    );
  }, [isAuthenticated, authUser, userOwnsTruck, isSupabaseConfigured, upsertTruckLiveLocation, mapSupabaseTruckToLocal, mergeTruckLocations]);

  const goOffline = useCallback(async ({ truckId, source, updates }: GoOfflineInput): Promise<void> => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] goOffline blocked - not authenticated');
      throw new Error('Not authenticated');
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] goOffline blocked - user does not own truck:', truckId);
      throw new Error(`User does not own truck ${truckId}`);
    }
    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Supabase not configured, skipping DB write');
      return;
    }

    if (__DEV__) {
      console.log('[AppContext] goOffline requested:', {
        truckId,
        source,
        extraKeys: updates ? Object.keys(updates) : [],
      });
    }

    const { data: rpcRow, error: rpcError } = await supabase.rpc('go_offline_truck', {
      p_truck_id: truckId,
      p_source: source,
      p_metadata: updates ? { updateKeys: Object.keys(updates) } : {},
    });

    if (rpcError) {
      console.log('[AppContext] go_offline_truck RPC failed:', {
        truckId,
        source,
        error: rpcError.message,
      });
      throw new Error(`Failed to go offline: ${rpcError.message}`);
    }
    if (!rpcRow) {
      throw new Error('Failed to go offline: truck not found or not authorized.');
    }

    let hydrated = mapSupabaseTruckToLocal(rpcRow);
    const locationRows = await fetchTruckLocationRows([truckId], 'goOffline');
    if (locationRows) {
      hydrated = mergeTruckLocations([hydrated], locationRows)[0];
    }

    setFoodTrucks(prev =>
      prev.map(truck => (truck.id === truckId ? { ...truck, ...hydrated } : truck))
    );
    setSupabaseOwnedTrucks(prev =>
      prev.map(truck => (truck.id === truckId ? { ...truck, ...hydrated } : truck))
    );

    // Non-LIVE fields (e.g. archive/archivedAt/archiveReason) aren't part of
    // the single-purpose go_offline_truck RPC; persist them the same way
    // updateTruckDetails always has. This keeps archiving a truck a
    // two-step-but-each-atomic sequence rather than folding an unrelated
    // concern into the LIVE-status RPC.
    if (updates && Object.keys(updates).length > 0) {
      await updateTruckDetails(truckId, updates);
    }
  }, [isAuthenticated, authUser, userOwnsTruck, isSupabaseConfigured, mapSupabaseTruckToLocal, mergeTruckLocations, fetchTruckLocationRows, updateTruckDetails]);

  useEffect(() => {
    if (!isAuthenticated || !authUser) return;

    const staleOpenTrucks = foodTrucks.filter((truck) => {
      const canAutoCloseTruck = userProfile?.role === 'admin' || truck.owner_id === authUser.id;
      if (!canAutoCloseTruck) return false;
      if (!isTruckStaleOpen(truck)) return false;

      const timestamp = getTruckLiveTimestamp(truck) ?? 'unknown';
      const attemptKey = `${truck.id}:${timestamp}`;
      if (staleOpenAutoCloseAttemptedRef.current.has(attemptKey)) return false;

      staleOpenAutoCloseAttemptedRef.current.add(attemptKey);
      if (__DEV__) {
        console.log('[AppContext] Stale open truck detected:', {
          truckId: truck.id,
          timestampUsed: timestamp,
        });
      }
      return true;
    });

    if (staleOpenTrucks.length === 0) return;

    staleOpenTrucks.forEach((truck) => {
      void goOffline({
        truckId: truck.id,
        source: 'expiration',
      })
        .then(() => {
          if (__DEV__) {
            console.log('[AppContext] Stale open auto-close update result:', {
              truckId: truck.id,
              currentUserId: authUser.id,
              error: null,
            });
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          if (__DEV__) {
            console.log('[AppContext] Stale open auto-close update result:', {
              truckId: truck.id,
              currentUserId: authUser.id,
              error: message,
            });
          }
          console.log('[AppContext] Stale open auto-close error:', message);
        });
    });
  }, [authUser, foodTrucks, goOffline, isAuthenticated, userProfile?.role]);

  const addMenuImage = useCallback(async (truckId: string, imageUrl: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
      return;
    }
    const truck = [...supabaseOwnedTrucks, ...foodTrucks].find(t => t.id === truckId);
    const updatedImages = Array.from(new Set([...(truck?.menu_images || []), imageUrl]));
    if (__DEV__) {
      console.log('[AppContext] addMenuImage queued for save:', {
        truckId,
        imageUrl,
        menuImageCount: updatedImages.length,
      });
    }
    await updateTruckDetails(truckId, { menu_images: updatedImages });
    if (__DEV__) {
      console.log('[AppContext] addMenuImage persisted:', {
        truckId,
        imageUrl,
        menuImageCount: updatedImages.length,
      });
    }
  }, [isAuthenticated, authUser, userOwnsTruck, foodTrucks, supabaseOwnedTrucks, updateTruckDetails]);

  const removeMenuImage = useCallback(async (truckId: string, imageUrl: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
      return;
    }
    const truck = [...supabaseOwnedTrucks, ...foodTrucks].find(t => t.id === truckId);
    const updatedImages = (truck?.menu_images || []).filter(img => img !== imageUrl);
    if (__DEV__) {
      console.log('[AppContext] removeMenuImage queued for save:', {
        truckId,
        imageUrl,
        menuImageCount: updatedImages.length,
      });
    }
    await updateTruckDetails(truckId, { menu_images: updatedImages });
  }, [isAuthenticated, authUser, userOwnsTruck, foodTrucks, supabaseOwnedTrucks, updateTruckDetails]);

  const addGalleryImage = useCallback((truckId: string, imageUrl: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
      return;
    }
    const truck = [...supabaseOwnedTrucks, ...foodTrucks].find(t => t.id === truckId);
    const updatedImages = [...(truck?.images || []), imageUrl];
    if (DEBUG) console.log('[AppContext] addGalleryImage for truck:', truckId);
    void updateTruckDetails(truckId, { images: updatedImages });
  }, [isAuthenticated, authUser, userOwnsTruck, foodTrucks, supabaseOwnedTrucks, updateTruckDetails]);

  const removeGalleryImage = useCallback((truckId: string, imageUrl: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
      return;
    }
    const truck = [...supabaseOwnedTrucks, ...foodTrucks].find(t => t.id === truckId);
    const updatedImages = (truck?.images || []).filter(img => img !== imageUrl);
    if (DEBUG) console.log('[AppContext] removeGalleryImage for truck:', truckId);
    void updateTruckDetails(truckId, { images: updatedImages });
  }, [isAuthenticated, authUser, userOwnsTruck, foodTrucks, supabaseOwnedTrucks, updateTruckDetails]);

  const getOwnedTrucks = useCallback(() => {
    if (!isAuthenticated || !authUser) return [];
    if (supabaseOwnedTrucks.length > 0) {
      return supabaseOwnedTrucks;
    }
    return foodTrucks.filter(truck => truck.owner_id === authUser.id);
  }, [isAuthenticated, authUser, foodTrucks, supabaseOwnedTrucks]);

  const isAdmin = userProfile?.role === 'admin';

  const isOwner = useMemo(() => {
    if (!isAuthenticated || !authUser) return false;
    if (isAdmin) return true;
    if (supabaseOwnedTrucks.length > 0) return true;
    return foodTrucks.some(truck => truck.owner_id === authUser.id);
  }, [isAuthenticated, authUser, isAdmin, foodTrucks, supabaseOwnedTrucks]);

  const getUserTruck = useCallback(() => {
    if (!isAuthenticated || !authUser) return null;
    const owned = supabaseOwnedTrucks.length > 0
      ? supabaseOwnedTrucks
      : foodTrucks.filter(truck => truck.owner_id === authUser.id);
    if (userProfile?.role === 'admin' && selectedAdminTruckId) {
      const selected = [...owned, ...foodTrucks].find(t => t.id === selectedAdminTruckId);
      if (selected) return selected;
    }
    if (owned.length === 0) return null;
    if (currentUser?.truck_id) {
      const selected = owned.find(t => t.id === currentUser.truck_id);
      if (selected) return selected;
    }
    return owned[0];
  }, [isAuthenticated, authUser, userProfile?.role, selectedAdminTruckId, currentUser, foodTrucks, supabaseOwnedTrucks]);

  const addReview = useCallback(
  async (truckId: string, rating: number, text: string) => {
    try {
      if (authLoading) {
        console.log('[AppContext] addReview blocked - auth loading');
        return;
      }

      if (!isAuthenticated || !authUser) {
        console.log('[AppContext] addReview blocked - not authenticated');
        return;
      }

      const trimmedText = text.trim();
      if (!trimmedText) {
        console.log('[AppContext] addReview blocked - empty text');
        return;
      }

      const reviewerName =
  currentUser?.name ||
  userProfile?.name ||
  (authUser as any)?.user_metadata?.name ||
  authUser.email?.split('@')[0] ||
  'Customer';

      const { data, error } = await supabase
        .from('reviews')
        .insert({
          truck_id: truckId,
          user_id: authUser.id,
          rating,
          text: trimmedText,
        })
        .select()
        .single();

      if (error) {
        console.error('[AppContext] addReview insert error:', error);
        throw error;
      }

      const newReview: Review = {
        id: data.id,
        truckId: data.truck_id,
        rating: data.rating,
        text: data.text,
        createdAt: data.created_at,
        user: {
   id: authUser.id,
   name: reviewerName,
   profile_photo: currentUser?.profile_photo || userProfile?.profile_photo,
},
      
      };

     await fetchReviewsFromSupabase();
     console.log('[AppContext] addReview success:', newReview); 
    } catch (error) {
      console.error('[AppContext] addReview failed:', error);
      throw error;
    }
  },
  [authLoading, isAuthenticated, authUser, currentUser, userProfile, fetchReviewsFromSupabase]
);

  const addReviewReply = useCallback(async (reviewId: string, truckId: string, body: string): Promise<void> => {
    if (!isAuthenticated || !authUser) {
      throw new Error('Not authenticated');
    }
    if (!userOwnsTruck(truckId)) {
      throw new Error(`User does not own truck ${truckId}`);
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error('Reply cannot be empty');
    }

    const { data, error } = await supabase
      .from('review_replies')
      .insert({
        review_id: reviewId,
        truck_id: truckId,
        owner_id: authUser.id,
        body: trimmedBody,
      })
      .select('id')
      .single();

    if (error || !data?.id) {
      console.log('[AppContext] addReviewReply error:', error?.message ?? 'No reply was created');
      throw new Error(`Could not save reply: ${error?.message ?? 'No reply was created'}`);
    }

    await fetchReviewsFromSupabase();
  }, [authUser, fetchReviewsFromSupabase, isAuthenticated, userOwnsTruck]);

  const updateReviewReply = useCallback(async (replyId: string, body: string): Promise<void> => {
    if (!isAuthenticated || !authUser) {
      throw new Error('Not authenticated');
    }

    const reply = reviews.map(review => review.ownerReply).find(item => item?.id === replyId);
    if (!reply) {
      throw new Error('Reply not found');
    }
    if (!userOwnsTruck(reply.truckId)) {
      throw new Error(`User does not own truck ${reply.truckId}`);
    }

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      throw new Error('Reply cannot be empty');
    }

    const { data, error } = await supabase
      .from('review_replies')
      .update({ body: trimmedBody })
      .eq('id', replyId)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data?.id) {
      console.log('[AppContext] updateReviewReply error:', error?.message ?? 'No reply was updated');
      throw new Error(`Could not update reply: ${error?.message ?? 'No reply was updated'}`);
    }

    await fetchReviewsFromSupabase();
  }, [authUser, fetchReviewsFromSupabase, isAuthenticated, reviews, userOwnsTruck]);

  const deleteReviewReply = useCallback(async (replyId: string): Promise<void> => {
    if (!isAuthenticated || !authUser) {
      throw new Error('Not authenticated');
    }

    const reply = reviews.map(review => review.ownerReply).find(item => item?.id === replyId);
    if (!reply) {
      throw new Error('Reply not found');
    }
    if (!userOwnsTruck(reply.truckId)) {
      throw new Error(`User does not own truck ${reply.truckId}`);
    }

    const { data, error } = await supabase
      .from('review_replies')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', replyId)
      .is('deleted_at', null)
      .select('id')
      .single();

    if (error || !data?.id) {
      console.log('[AppContext] deleteReviewReply error:', error?.message ?? 'No reply was deleted');
      throw new Error(`Could not delete reply: ${error?.message ?? 'No reply was deleted'}`);
    }

    await fetchReviewsFromSupabase();
  }, [authUser, fetchReviewsFromSupabase, isAuthenticated, reviews, userOwnsTruck]);

  const getReviews = useCallback((truckId: string) => {
    return reviews.filter(review => review.truckId === truckId).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [reviews]);

  const getAverageRating = useCallback((truckId: string) => {
    const truckReviews = reviews.filter(review => review.truckId === truckId);
    if (truckReviews.length === 0) return { average: 0, count: 0 };
    
    const sum = truckReviews.reduce((acc, review) => acc + review.rating, 0);
    const average = sum / truckReviews.length;
    
    return { average: Math.round(average * 10) / 10, count: truckReviews.length };
  }, [reviews]);

  const persistMenuItemsToSupabase = useCallback(async (truckId: string, items: MenuItem[]) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
      return;
    }
    if (!isSupabaseConfigured) return;
    if (DEBUG) console.log('[AppContext] Persisting menu items for truck:', truckId);
    if (__DEV__) {
      console.log('[AppContext] Menu items Supabase save payload:', {
        truckId,
        itemCount: items.length,
        itemsWithImages: items.filter(item => typeof item.image === 'string' && item.image.trim().length > 0).length,
      });
    }
    let updateQuery = supabase
      .from('trucks')
      .update({ menu_items: items, updated_at: new Date().toISOString() })
      .eq('id', truckId);

    if (userProfile?.role !== 'admin') {
      updateQuery = updateQuery.eq('owner_id', authUser.id);
    }

    const { data, error } = await updateQuery.select('id, menu_items');

    if (__DEV__) {
      const refreshedItems = parseJsonArray(data?.[0]?.menu_items);
      console.log('[AppContext] Menu items Supabase update result:', {
        truckId,
        rows: data?.length ?? 0,
        error: error?.message ?? null,
        refreshedItemCount: refreshedItems.length,
        refreshedItemsWithImages: refreshedItems.filter(item => typeof item?.image === 'string' && item.image.trim().length > 0).length,
      });
    }

    if (error) {
      console.error('[AppContext] Error persisting menu items:', error.message);
      throw new Error(`Failed to persist menu items: ${error.message}`);
    }
  }, [isAuthenticated, authUser, userOwnsTruck, userProfile?.role]);

  const persistAnnouncementsToSupabase = useCallback(async (
    truckId: string,
    items: Announcement[],
    newAnnouncement?: Announcement,
  ) => {
  if (!isAuthenticated || !authUser) {
    if (DEBUG) console.log('[AppContext] blocked - not authenticated');
    return;
  }

  if (!userOwnsTruck(truckId)) {
    if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
    return;
  }

  if (!isSupabaseConfigured) return;

  const activeItems = items.filter(item => item.truck_id !== truckId || isAnnouncementActive(item));

  if (DEBUG) console.log('[AppContext] Persisting announcements for truck:', truckId);

  const { error } = await supabase
    .from('trucks')
    .update({ announcements: activeItems, updated_at: new Date().toISOString() })
    .eq('id', truckId)
    .eq('owner_id', authUser.id);

  if (error) {
    console.log('[AppContext] Error persisting announcements:', error.message);
    return;
  }

  // Only notify when this persist call is for a genuinely new announcement.
  // Deleting/editing the list must never rebroadcast an existing announcement.
  if (newAnnouncement) {
    try {
      const { error: fnError } = await supabase.functions.invoke('notify-truck-announcement', {
        body: {
          truckId,
          message: newAnnouncement.message,
        },
      });

      if (fnError) {
        console.log('[AppContext] Error invoking announcement notification:', fnError.message);
      } else {
        console.log('[AppContext] Announcement notification invoked');
      }
    } catch (err: any) {
      console.log('[AppContext] Unexpected error invoking announcement notification:', err?.message || err);
    }
  }
}, [isAuthenticated, authUser, userOwnsTruck, isSupabaseConfigured]);

  const addMenuItem = useCallback(async (item: Omit<MenuItem, 'id'>): Promise<MenuItem | null> => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return null;
    }
    if (!userOwnsTruck(item.truck_id)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', item.truck_id);
      return null;
    }
    const newItem: MenuItem = {
      ...item,
      id: `menu-${Date.now()}`,
    };
    const updated = [...menuItems, newItem];
    const truckItems = updated.filter(i => i.truck_id === item.truck_id);
    if (__DEV__) {
      console.log('[AppContext] addMenuItem local+persist start:', {
        truckId: item.truck_id,
        itemId: newItem.id,
        image: newItem.image ?? null,
      });
    }
    setMenuItems(updated);
    try {
      await persistMenuItemsToSupabase(item.truck_id, truckItems);
      return newItem;
    } catch (error) {
      console.error('[AppContext] addMenuItem persist failed:', error);
      setMenuItems(menuItems);
      throw error;
    }
  }, [isAuthenticated, authUser, userOwnsTruck, persistMenuItemsToSupabase, menuItems]);

  const updateMenuItem = useCallback(async (itemId: string, updates: Partial<MenuItem>): Promise<void> => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }

    const changedItem = menuItems.find(i => i.id === itemId);
    if (!changedItem) {
      if (__DEV__) console.error('[AppContext] updateMenuItem blocked - item not found:', { itemId });
      return;
    }
    if (!userOwnsTruck(changedItem.truck_id)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', changedItem.truck_id);
      return;
    }
    const updated = menuItems.map(item =>
      item.id === itemId ? { ...item, ...updates } : item
    );
    const updatedItem = updated.find(i => i.id === itemId);
    const truckItems = updated.filter(i => i.truck_id === changedItem.truck_id);
    if (__DEV__) {
      console.log('[AppContext] updateMenuItem local+persist start:', {
        truckId: changedItem.truck_id,
        itemId,
        image: updatedItem?.image ?? null,
      });
    }
    setMenuItems(updated);
    try {
      await persistMenuItemsToSupabase(changedItem.truck_id, truckItems);
    } catch (error) {
      console.error('[AppContext] updateMenuItem persist failed:', error);
      setMenuItems(menuItems);
      throw error;
    }
  }, [isAuthenticated, authUser, userOwnsTruck, persistMenuItemsToSupabase, menuItems]);

  const deleteMenuItem = useCallback((itemId: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    setMenuItems(prev => {
      const deletedItem = prev.find(i => i.id === itemId);
      if (deletedItem && !userOwnsTruck(deletedItem.truck_id)) {
        if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', deletedItem.truck_id);
        return prev;
      }
      const updated = prev.filter(item => item.id !== itemId);
      if (deletedItem) {
        const truckItems = updated.filter(i => i.truck_id === deletedItem.truck_id);
        persistMenuItemsToSupabase(deletedItem.truck_id, truckItems);
      }
      return updated;
    });
  }, [isAuthenticated, authUser, userOwnsTruck, persistMenuItemsToSupabase, menuItems]);

  const updateOperatingHours = useCallback(async (truckId: string, hours: OperatingHours) => {
    if (DEBUG) console.log('[AppContext] updateOperatingHours for:', truckId);
    try {
      await updateTruckDetails(truckId, { operatingHours: hours });

    } catch (error: any) {
      console.log('[AppContext] updateOperatingHours error:', error?.message);
      throw error;
    }
  }, [updateTruckDetails]);

  const getOperatingHours = useCallback((truckId: string) => {
    const truck = foodTrucks.find(t => t.id === truckId);
    return truck?.operatingHours || null;
  }, [foodTrucks]);

  const isTruckOpenNow = useCallback((truckId: string) => {
    const truck = foodTrucks.find(t => t.id === truckId);
    // canonical open flag = open_now
    // Stale live locations are treated as closed to avoid overnight ghost listings.
    return !!truck?.open_now && !isTruckStaleOpen(truck);
  }, [foodTrucks]);

  const incrementView = useCallback((truckId: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => {
        if (truck.id !== truckId) return truck;
        const analytics = truck.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
        return { ...truck, analytics: { ...analytics, views: analytics.views + 1 } };
      })
    );
  }, []);

  const incrementMenuView = useCallback((truckId: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => {
        if (truck.id !== truckId) return truck;
        const analytics = truck.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
        return { ...truck, analytics: { ...analytics, menuViews: analytics.menuViews + 1 } };
      })
    );
  }, []);

  const incrementCall = useCallback((truckId: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => {
        if (truck.id !== truckId) return truck;
        const analytics = truck.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
        return { ...truck, analytics: { ...analytics, calls: analytics.calls + 1 } };
      })
    );
  }, []);

  const incrementNavigation = useCallback((truckId: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => {
        if (truck.id !== truckId) return truck;
        const analytics = truck.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
        return { ...truck, analytics: { ...analytics, navigations: analytics.navigations + 1 } };
      })
    );
  }, []);

  const incrementPhotoView = useCallback((truckId: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => {
        if (truck.id !== truckId) return truck;
        const analytics = truck.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
        return { ...truck, analytics: { ...analytics, photoViews: analytics.photoViews + 1 } };
      })
    );
  }, []);

  const getTruckAnalytics = useCallback((truckId: string) => {
    const truck = foodTrucks.find(t => t.id === truckId);
    const analytics = truck?.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
    const favoritesCount = currentUser?.favorites.includes(truckId) ? 1 : 0;
    const checkInAnalytics = truckCheckInAnalytics[truckId] ?? { allTime: 0, thisMonth: 0 };
    return {
      ...analytics,
      favorites: favoritesCount,
      customerCheckIns: checkInAnalytics.allTime,
      customerCheckInsThisMonth: checkInAnalytics.thisMonth,
    };
  }, [foodTrucks, currentUser, truckCheckInAnalytics]);

  const incrementQrScan = useCallback((truckId: string, platform: string) => {
    if (DEBUG) console.log(`QR scan tracked for truck ${truckId} from ${platform}`);
    setFoodTrucks(prev => 
      prev.map(truck => {
        if (truck.id !== truckId) return truck;
        const analytics = truck.analytics || { views: 0, favorites: 0, menuViews: 0, calls: 0, navigations: 0, photoViews: 0, qrScans: 0 };
        return { 
          ...truck, 
          analytics: { 
            ...analytics, 
            qrScans: analytics.qrScans + 1,
            lastQrScan: new Date().toISOString()
          } 
        };
      })
    );
  }, []);

  const getQrScanStats = useCallback((truckId: string) => {
    const truck = foodTrucks.find(t => t.id === truckId);
    const analytics = truck?.analytics || { qrScans: 0, lastQrScan: undefined };
    return {
      totalScans: analytics.qrScans || 0,
      lastScanned: analytics.lastQrScan,
    };
  }, [foodTrucks]);

  const addAnnouncement = useCallback((truckId: string, message: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(truckId)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
      return;
    }
    const newAnnouncement: Announcement = {
      id: `announcement-${Date.now()}`,
      truck_id: truckId,
      message,
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + ANNOUNCEMENT_EXPIRATION_MS).toISOString(),
    };
    if (DEBUG) console.log('[AppContext] addAnnouncement for truck:', truckId);
    setAnnouncements(prev => {
      const updated = [newAnnouncement, ...prev];
      const truckAnnouncements = updated.filter(a => a.truck_id === truckId);
      persistAnnouncementsToSupabase(truckId, truckAnnouncements, newAnnouncement);
      return updated;
    });
  }, [isAuthenticated, authUser, userOwnsTruck, persistAnnouncementsToSupabase]);

  const deleteAnnouncement = useCallback((announcementId: string) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }

    setAnnouncements(prev => {
      const toDelete = prev.find(a => a.id === announcementId);
      if (toDelete && !userOwnsTruck(toDelete.truck_id)) {
        if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', toDelete.truck_id);
        return prev;
      }
      const updated = prev.filter(a => a.id !== announcementId);
      if (toDelete) {
        const truckAnnouncements = updated.filter(a => a.truck_id === toDelete.truck_id);
        persistAnnouncementsToSupabase(toDelete.truck_id, truckAnnouncements);
      }
      return updated;
    });
  }, [isAuthenticated, authUser, userOwnsTruck, persistAnnouncementsToSupabase, announcements]);

  const getAnnouncements = useCallback((truckId: string) => {

    return announcements
      .filter(announcement => announcement.truck_id === truckId)
      .filter(announcement => isAnnouncementActive(announcement))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [announcements]);

  const getUpcomingStops = useCallback((truckId: string) => {
    const requestedId = truckId?.toString() ?? '';

    return upcomingStops
      .filter(stop => stop.truck_id?.toString() === requestedId)
      .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  }, [upcomingStops]);

  const getNextUpcomingStopForTruck = useCallback((truckId: string) => {
    const requestedId = truckId?.toString() ?? '';
    const now = Date.now();

    return upcomingStops.find((stop) => {
      if (stop.truck_id?.toString() !== requestedId) return false;
      if (stop.status === 'cancelled' || stop.status === 'completed') return false;

      const startsAt = Date.parse(stop.starts_at);
      return Number.isFinite(startsAt) && startsAt > now;
    }) ?? null;
  }, [upcomingStops]);

  const getTruckActivityStatus = useCallback((truck: FoodTruck | null | undefined): TruckActivityStatus => {
    const now = Date.now();
    const requestedId = truck?.id?.toString() ?? '';
    const parseActivityTime = (value: string | number | null | undefined): number | null => {
      if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
      }
      if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return null;
    };
    const formatLastActivityLabel = (timestamp: number | null): string => {
      if (timestamp === null) return '';

      const startOfToday = new Date(now);
      startOfToday.setHours(0, 0, 0, 0);
      const startOfActivityDay = new Date(timestamp);
      startOfActivityDay.setHours(0, 0, 0, 0);
      const diffDays = Math.max(
        0,
        Math.floor((startOfToday.getTime() - startOfActivityDay.getTime()) / (24 * 60 * 60 * 1000))
      );

      if (diffDays === 0) return 'Updated Today';
      if (diffDays === 1) return 'Updated Yesterday';
      return `Updated ${diffDays} Days Ago`;
    };

    const futureStops = upcomingStops.filter((stop) => {
      if (!requestedId || stop.truck_id?.toString() !== requestedId) return false;
      if (stop.status !== 'scheduled') return false;

      const startsAt = parseActivityTime(stop.starts_at);
      return startsAt !== null && startsAt > now;
    });
    const hasUpcomingStop = futureStops.length > 0;
    const stopActivityTime = futureStops
      .map(stop => (
        parseActivityTime(stop.updated_at) ??
        parseActivityTime(stop.created_at) ??
        parseActivityTime(stop.starts_at)
      ))
      .filter((timestamp): timestamp is number => timestamp !== null)
      .sort((a, b) => b - a)[0] ?? null;
    const lastLiveTime = parseActivityTime(truck?.lastLiveUpdatedAt);
    const ownerActivityTime = parseActivityTime(truck?.lastOwnerActivityAt);
    const lastUpdatedTime = parseActivityTime(truck?.lastUpdated);
    const activityTimes = [lastLiveTime, ownerActivityTime, lastUpdatedTime, stopActivityTime]
      .filter((timestamp): timestamp is number => timestamp !== null);
    const lastActivityTime = activityTimes.length > 0 ? Math.max(...activityTimes) : null;
    const hasRecentLiveActivity =
      lastLiveTime !== null && now - lastLiveTime <= ACTIVE_ON_TRUCKTAP_WINDOW_MS;
    const meaningfulActivityTimes = [ownerActivityTime, lastUpdatedTime, stopActivityTime]
      .filter((timestamp): timestamp is number => timestamp !== null);
    const hasRecentMeaningfulActivity = meaningfulActivityTimes.some(
      timestamp => now - timestamp <= ACTIVE_ON_TRUCKTAP_WINDOW_MS
    );
    const activeReason: TruckActivityStatus['activeReason'] = truck?.open_now
      ? 'open_now'
      : hasRecentLiveActivity
      ? 'recent_live_activity'
      : hasUpcomingStop
      ? 'upcoming_stop'
      : hasRecentMeaningfulActivity
      ? 'recent_meaningful_activity'
      : 'none';

    return {
      lastActivityAt: lastActivityTime === null ? undefined : new Date(lastActivityTime).toISOString(),
      lastActivityLabel: formatLastActivityLabel(lastActivityTime),
      activeOnTruckTap: activeReason !== 'none',
      activeReason,
      daysSinceActivity:
        lastActivityTime === null ? null : Math.max(0, Math.floor((now - lastActivityTime) / (24 * 60 * 60 * 1000))),
      hasUpcomingStop,
      hasRecentLiveActivity,
      hasRecentMeaningfulActivity,
    };
  }, [upcomingStops]);

  const getTruckActivitySummary = useCallback((truckId: string): TruckActivitySummary => {
    const requestedId = truckId?.toString() ?? '';
    const now = Date.now();
    const truck = foodTrucks.find(item => item.id?.toString() === requestedId);
    const lastLiveTime = truck?.lastLiveUpdatedAt ? Date.parse(truck.lastLiveUpdatedAt) : Number.NaN;
    const lastUpdatedTime = truck?.lastUpdated ? Date.parse(truck.lastUpdated) : Number.NaN;
    const manualActivityTime =
      typeof truck?.lastOwnerActivityAt === 'number' ? truck.lastOwnerActivityAt : Number.NaN;
    const recentLive =
      isTruckOpenNow(requestedId) ||
      (Number.isFinite(lastLiveTime) && now - lastLiveTime <= INACTIVITY_WINDOW_MS);
    const recentOwnerActivity =
      (Number.isFinite(manualActivityTime) && now - manualActivityTime <= INACTIVITY_WINDOW_MS) ||
      (Number.isFinite(lastUpdatedTime) && now - lastUpdatedTime <= INACTIVITY_WINDOW_MS);
    const hasBio = Boolean((truck?.bio ?? '').trim());
    const hasMenuItems = menuItems.some(item => item.truck_id?.toString() === requestedId);
    const hasGalleryPhotos = Boolean(
      (truck?.images?.length ?? 0) > 0 ||
      (truck?.hero_image && truck.hero_image !== DEFAULT_TRUCK_HERO_IMAGE)
    );
    const hasReviews = reviews.some(review => review.truckId?.toString() === requestedId);

    const futureStops = upcomingStops.filter((stop) => {
      if (stop.truck_id?.toString() !== requestedId) return false;
      if (stop.status === 'cancelled' || stop.status === 'completed') return false;

      const startsAt = Date.parse(stop.starts_at);
      return Number.isFinite(startsAt) && startsAt > now;
    });

    const truckAnnouncements = announcements.filter(
      announcement => announcement.truck_id?.toString() === requestedId
    );
    const announcementTimes = truckAnnouncements
      .map(announcement => Date.parse(announcement.timestamp))
      .filter(Number.isFinite);
    const recentAnnouncementCount = announcementTimes.filter(
      timestamp => now - timestamp <= INACTIVITY_WINDOW_MS
    ).length;

    const activityTimes = [
      Number.isFinite(lastLiveTime) ? lastLiveTime : null,
      Number.isFinite(lastUpdatedTime) ? lastUpdatedTime : null,
      Number.isFinite(manualActivityTime) ? manualActivityTime : null,
      ...announcementTimes,
    ].filter((timestamp): timestamp is number => typeof timestamp === 'number');
    const lastActivityTime = activityTimes.length > 0 ? Math.max(...activityTimes) : null;

    return {
      inactive:
        !recentLive &&
        futureStops.length === 0 &&
        recentAnnouncementCount === 0 &&
        !hasBio &&
        !hasMenuItems &&
        !hasGalleryPhotos &&
        !hasReviews &&
        !recentOwnerActivity,
      lastLiveAt: Number.isFinite(lastLiveTime) ? truck?.lastLiveUpdatedAt : undefined,
      upcomingStopCount: futureStops.length,
      announcementCount: truckAnnouncements.length,
      recentAnnouncementCount,
      daysSinceActivity:
        lastActivityTime === null ? null : Math.max(0, Math.floor((now - lastActivityTime) / (24 * 60 * 60 * 1000))),
    };
  }, [announcements, foodTrucks, isTruckOpenNow, menuItems, reviews, upcomingStops]);

  const isTruckInactive = useCallback((truckId: string) => {
    return getTruckActivitySummary(truckId).inactive;
  }, [getTruckActivitySummary]);

  const addUpcomingStop = useCallback(async (
    stop: Omit<UpcomingStop, 'id' | 'created_at' | 'updated_at'>
  ): Promise<UpcomingStop> => {
    if (!isAuthenticated || !authUser) {
      throw new Error('Not authenticated');
    }

    if (!userOwnsTruck(stop.truck_id)) {
      throw new Error(`User does not own truck ${stop.truck_id}`);
    }

    const locationText = stop.location_text.trim();
    const startsAt = new Date(stop.starts_at);
    const endsAt = new Date(stop.ends_at);

    if (!locationText) {
      throw new Error('Location is required');
    }
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new Error('End time must be after start time');
    }

    const payload = {
      truck_id: stop.truck_id,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      location_text: locationText,
      note: stop.note?.trim() || null,
      status: normalizeUpcomingStopStatus(stop.status),
    };

    if (!isSupabaseConfigured) {
      const localStop: UpcomingStop = {
        id: `upcoming-stop-${Date.now()}`,
        ...payload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setUpcomingStops(prev => [...prev, localStop].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)));
      return localStop;
    }

    const { data, error } = await supabase
      .from('upcoming_stops')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.log('[AppContext] Add upcoming stop error:', error.message);
      throw new Error(`Could not add upcoming stop: ${error.message}`);
    }

    const created = mapUpcomingStopRow(data);
    setUpcomingStops(prev => [...prev, created].sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)));
    return created;
  }, [authUser, isAuthenticated, userOwnsTruck]);

  const updateUpcomingStop = useCallback(async (
    stopId: string,
    updates: Partial<Omit<UpcomingStop, 'id' | 'truck_id' | 'created_at' | 'updated_at'>>
  ): Promise<UpcomingStop> => {
    const existing = upcomingStops.find(stop => stop.id === stopId);

    if (!existing) {
      throw new Error('Upcoming stop not found');
    }
    if (!isAuthenticated || !authUser) {
      throw new Error('Not authenticated');
    }
    if (!userOwnsTruck(existing.truck_id)) {
      throw new Error(`User does not own truck ${existing.truck_id}`);
    }

    const nextStartsAt = updates.starts_at ?? existing.starts_at;
    const nextEndsAt = updates.ends_at ?? existing.ends_at;
    const startsAt = new Date(nextStartsAt);
    const endsAt = new Date(nextEndsAt);

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      throw new Error('End time must be after start time');
    }

    const payload: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (updates.starts_at !== undefined) payload.starts_at = startsAt.toISOString();
    if (updates.ends_at !== undefined) payload.ends_at = endsAt.toISOString();
    if (updates.location_text !== undefined) {
      const locationText = updates.location_text.trim();
      if (!locationText) throw new Error('Location is required');
      payload.location_text = locationText;
    }
    if (updates.note !== undefined) payload.note = updates.note?.trim() || null;
    if (updates.status !== undefined) payload.status = normalizeUpcomingStopStatus(updates.status);

    if (!isSupabaseConfigured) {
      const updated: UpcomingStop = {
        ...existing,
        ...payload,
        starts_at: payload.starts_at ?? existing.starts_at,
        ends_at: payload.ends_at ?? existing.ends_at,
        location_text: payload.location_text ?? existing.location_text,
        note: Object.prototype.hasOwnProperty.call(payload, 'note') ? payload.note : existing.note,
        status: payload.status ?? existing.status,
      };
      setUpcomingStops(prev => prev.map(stop => stop.id === stopId ? updated : stop));
      return updated;
    }

    const { data, error } = await supabase
      .from('upcoming_stops')
      .update(payload)
      .eq('id', stopId)
      .select('*')
      .single();

    if (error) {
      console.log('[AppContext] Update upcoming stop error:', error.message);
      throw new Error(`Could not update upcoming stop: ${error.message}`);
    }

    const updated = mapUpcomingStopRow(data);
    setUpcomingStops(prev => prev.map(stop => stop.id === stopId ? updated : stop));
    return updated;
  }, [authUser, isAuthenticated, upcomingStops, userOwnsTruck]);

  const deleteUpcomingStop = useCallback(async (stopId: string): Promise<void> => {
    const existing = upcomingStops.find(stop => stop.id === stopId);

    if (!existing) {
      throw new Error('Upcoming stop not found');
    }
    if (!isAuthenticated || !authUser) {
      throw new Error('Not authenticated');
    }
    if (!userOwnsTruck(existing.truck_id)) {
      throw new Error(`User does not own truck ${existing.truck_id}`);
    }

    if (isSupabaseConfigured) {
      const { error } = await supabase
        .from('upcoming_stops')
        .delete()
        .eq('id', stopId);

      if (error) {
        console.log('[AppContext] Delete upcoming stop error:', error.message);
        throw new Error(`Could not delete upcoming stop: ${error.message}`);
      }
    }

    setUpcomingStops(prev => prev.filter(stop => stop.id !== stopId));
  }, [authUser, isAuthenticated, upcomingStops, userOwnsTruck]);

  const setTruckVerified = useCallback((truckId: string, value: boolean) => {
    setFoodTrucks(prev => 
      prev.map(truck => 
        truck.id === truckId ? { ...truck, verified: value } : truck
      )
    );
  }, []);

  // Legacy owner readiness helper. This intentionally includes menu/hours/contact
  // and must not be used as the customer discoverability rule.
  const isProfileComplete = useCallback((truckId: string) => {
    const truck = foodTrucks.find(t => t.id === truckId);
    if (!truck) return false;
    
    const hasBasicInfo = truck.name && truck.bio && truck.cuisine_type && truck.phone;
    const hasMenu = menuItems.filter(item => item.truck_id === truckId).length > 0;
    const hasHours = hasHoursSet(truckId);
    
    return !!(hasBasicInfo && hasMenu && hasHours);
  }, [foodTrucks, menuItems, hasHoursSet]);

  const getDaysAgoText = useCallback((isoDate: string | undefined) => {
    if (!isoDate) return '';
    
    const date = new Date(isoDate);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInDays === 0) return 'Updated today';
    if (diffInDays === 1) return 'Updated 1 day ago';
    if (diffInDays < 7) return `Updated ${diffInDays} days ago`;
    if (diffInDays < 30) return `Updated ${Math.floor(diffInDays / 7)} weeks ago`;
    return `Updated ${Math.floor(diffInDays / 30)} months ago`;
  }, []);

  const logout = useCallback(async () => {
    if (__DEV__) {
      console.log('[AppContext] Logout requested:', {
        file: 'contexts/AppContext.tsx',
        functionName: 'logout',
        reason: 'Explicit AppContext logout call',
        userId: authUser?.id ?? userProfile?.id ?? null,
        email: authUser?.email ?? userProfile?.email ?? null,
        sessionExists: isAuthenticated,
      });
    }
    setUserProfile(null);
    try {
      // Clear the push token before ending the session: once signed out, this
      // client can no longer pass the profiles RLS check to null it out itself.
      await clearPushTokenForUser(authUser?.id);
      await AsyncStorage.multiRemove(['userProfile', 'authUser']);
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();

      }
      if (DEBUG) console.log('[AppContext] Logged out, cleared storage');
    } catch (error) {
      console.log('[AppContext] Error during logout:', error);
    }
  }, [authUser, isAuthenticated, userProfile]);

  const setPendingRedirect = useCallback((route: string | null) => {
    if (DEBUG) console.log('[AppContext] Setting pending redirect:', route);
    setPendingRedirectState(route);
  }, []);

  const consumePendingRedirect = useCallback(() => {
    const route = pendingRedirect;
    if (DEBUG) console.log('[AppContext] Consuming pending redirect:', route);
    setPendingRedirectState(null);
    return route;
  }, [pendingRedirect]);

  const refreshOwnerMessages = useCallback(async (): Promise<void> => {
    if (!isAuthenticated || !authUser || authLoading) {
      setOwnerMessages([]);
      return;
    }

    const canViewOwnerMessages = userProfile?.role === 'admin' || isOwner;
    if (!canViewOwnerMessages) {
      setOwnerMessages([]);
      return;
    }

    if (!isSupabaseConfigured) {
      setOwnerMessages(teamUpdates.map(mapTeamUpdateToOwnerMessage));
      return;
    }

    try {
      const { data: messageRows, error: messagesError } = await supabase
        .from('owner_messages')
        .select('*')
        .order('created_at', { ascending: false });

      if (messagesError) {
        console.log('[AppContext] Owner messages fetch error:', messagesError.message);
        setOwnerMessages(teamUpdates.map(mapTeamUpdateToOwnerMessage));
        return;
      }

      const messageIds = (messageRows ?? []).map((row: any) => row.id).filter(Boolean);
      let readsByMessageId = new Map<string, string>();

      if (messageIds.length > 0) {
        const { data: readRows, error: readsError } = await supabase
          .from('owner_message_reads')
          .select('message_id, read_at')
          .eq('user_id', authUser.id)
          .in('message_id', messageIds);

        if (readsError) {
          console.log('[AppContext] Owner message reads fetch error:', readsError.message);
        } else {
          readsByMessageId = new Map(
            (readRows ?? []).map((row: any) => [row.message_id?.toString?.() ?? '', row.read_at])
          );
        }
      }

      const mapped = (messageRows ?? []).map((row: any) =>
        mapOwnerMessageRow(row, readsByMessageId.get(row.id?.toString?.() ?? '') ?? null)
      );
      setOwnerMessages(mapped);
    } catch (error: any) {
      console.log('[AppContext] Unexpected owner messages fetch error:', error?.message ?? error);
      setOwnerMessages(teamUpdates.map(mapTeamUpdateToOwnerMessage));
    }
  }, [authLoading, authUser, isAuthenticated, isOwner, userProfile?.role]);

  useEffect(() => {
    void refreshOwnerMessages();
  }, [refreshOwnerMessages]);

  const createOwnerMessage = useCallback(async (message: { title: string; body: string; type: OwnerMessageType }) => {
    if (!isAuthenticated || !authUser || userProfile?.role !== 'admin') {
      throw new Error('Only admins can send owner messages.');
    }

    const title = message.title.trim();
    const body = message.body.trim();
    if (!title || !body) {
      throw new Error('Title and message body are required.');
    }

    if (!isSupabaseConfigured) {
      const localMessage: OwnerMessage = {
        id: `local-owner-message-${Date.now()}`,
        title,
        body,
        type: message.type,
        created_by: authUser.id,
        created_at: new Date().toISOString(),
        target_scope: 'all_trucks',
        target_truck_id: null,
        read_at: null,
      };
      setOwnerMessages(prev => [localMessage, ...prev]);
      return;
    }

    const { data, error } = await supabase
      .from('owner_messages')
      .insert({
        title,
        body,
        type: message.type,
        created_by: authUser.id,
        target_scope: 'all_trucks',
      })
      .select('*')
      .single();

    if (error) {
      console.log('[AppContext] Owner message create error:', error.message);
      throw new Error(`Could not send message: ${error.message}`);
    }

    const created = mapOwnerMessageRow(data, null);
    setOwnerMessages(prev => [created, ...prev].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    ));
  }, [authUser, isAuthenticated, userProfile?.role]);

  const getTeamUpdates = useCallback(() => {
    return [...ownerMessages].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [ownerMessages]);

  const markOwnerUpdatesViewed = useCallback(async () => {
    const now = new Date().toISOString();
    setLastViewedOwnerUpdates(now);
    void AsyncStorage.setItem('lastViewedOwnerUpdates', JSON.stringify(now));

    const unreadMessages = ownerMessages.filter(message => !message.read_at);
    if (unreadMessages.length === 0 || !isAuthenticated || !authUser) {
      return;
    }

    setOwnerMessages(prev => prev.map(message =>
      message.read_at ? message : { ...message, read_at: now }
    ));

    if (!isSupabaseConfigured) {
      return;
    }

    const rows = unreadMessages.map(message => ({
      message_id: message.id,
      user_id: authUser.id,
      read_at: now,
    }));

    const { error } = await supabase
      .from('owner_message_reads')
      .upsert(rows, { onConflict: 'message_id,user_id' });

    if (error) {
      console.log('[AppContext] Owner message read receipt error:', error.message);
    }
  }, [authUser, isAuthenticated, ownerMessages]);

  const hasUnreadOwnerUpdates = useCallback(() => {
    if (ownerMessages.some(message => !message.read_at)) return true;
    if (!lastViewedOwnerUpdates && ownerMessages.length > 0) return true;

    if (!lastViewedOwnerUpdates) return false;
    const lastViewed = new Date(lastViewedOwnerUpdates).getTime();
    return ownerMessages.some(message => new Date(message.created_at).getTime() > lastViewed);
  }, [lastViewedOwnerUpdates, ownerMessages]);

  const formatTime = (timeStr: string): string => {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;
    return `${displayHours}${minutes > 0 ? `:${minutes.toString().padStart(2, '0')}` : ''}${period}`;
  };

  const formatOperatingHours = useCallback((truckId: string): string => {
    const truck = foodTrucks.find(t => t.id === truckId);
    if (!truck?.operatingHours) return 'Hours not set';

    const hours = truck.operatingHours;
    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    
    const groups: { days: string[]; hours: string }[] = [];
    
    daysOfWeek.forEach(day => {
      const dayHours = hours[day];
      if (!dayHours) return;
      
      const hoursStr = dayHours.closed 
        ? 'Closed' 
        : `${formatTime(dayHours.open)}–${formatTime(dayHours.close)}`;
      
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.hours === hoursStr) {
        lastGroup.days.push(day);
      } else {
        groups.push({ days: [day], hours: hoursStr });
      }
    });
    
    return groups.map(group => {
      const dayStr = group.days.length === 1 
        ? group.days[0].slice(0, 3)
        : group.days.length === 7
        ? 'Daily'
        : `${group.days[0].slice(0, 3)}–${group.days[group.days.length - 1].slice(0, 3)}`;
      return `${dayStr}: ${group.hours}`;
    }).join(', ');
  }, [foodTrucks]);

  return useMemo(() => ({
    currentUser,
    isOnboarded,
    foodTrucks,
    reviews,
    menuItems,
    announcements,
    upcomingStops,
    upcomingStopsLoading,
    checklistDismissed,
    showClosed,
    customerRadius,
    exploreMode,
    exploreCenter,
    pendingRedirect,
    pendingNotificationRoute,
    isInitialNotificationResponseChecked,
    lastViewedOwnerUpdates,
    selectedAdminTruckId,
    ownerMessages,
    setSelectedAdminTruckId,
    beginImagePickerSession,
    endImagePickerSession,
    setShowClosed,
    setCustomerRadius,
    setExploreMode,
    setExploreCenter,
    setCurrentUser,
    completeOnboarding,
    refreshCustomerProfile,
    toggleFavorite,
    addMenuImage,
    removeMenuImage,
    addTruckImage,
    addGalleryImage,
    removeGalleryImage,
    removeTruckImage,
    updateTruckDetails,
    goLive,
    goOffline,
    getUserTruck,
    getOwnedTrucks,
    isOwner,
    isOwnerLoading,
    refreshOwnedTrucks,
    refreshReviews: fetchReviewsFromSupabase,
    supabaseOwnedTrucks,
    addReview,
    addReviewReply,
    updateReviewReply,
    deleteReviewReply,
    getReviews,
    getAverageRating,
    addMenuItem,
    updateMenuItem,
    deleteMenuItem,
    updateOperatingHours,
    getOperatingHours,
    isTruckOpenNow,
    hasHoursSet,
    qrShared,
    markQrShared,
    dismissChecklist,
    incrementView,
    incrementMenuView,
    incrementCall,
    incrementNavigation,
    incrementPhotoView,
    getTruckAnalytics,
    addAnnouncement,
    deleteAnnouncement,
    getAnnouncements,
    getUpcomingStops,
    getNextUpcomingStopForTruck,
    getTruckActivityStatus,
    getTruckActivitySummary,
    isTruckInactive,
    addUpcomingStop,
    updateUpcomingStop,
    deleteUpcomingStop,
    refreshUpcomingStops: fetchUpcomingStopsFromSupabase,
    setTruckVerified,
    logout,
    incrementQrScan,
    getQrScanStats,
    allTrucksLoading,
    refreshAllTrucks: fetchAllTrucksFromSupabase,
    isProfileComplete,
    getDaysAgoText,
    setPendingRedirect,
    setPendingNotificationRoute,
    setIsInitialNotificationResponseChecked,
    consumePendingRedirect,
    getTeamUpdates,
    markOwnerUpdatesViewed,
    hasUnreadOwnerUpdates,
    refreshOwnerMessages,
    createOwnerMessage,
    formatOperatingHours,
  }), [
    currentUser, isOnboarded, foodTrucks, reviews, menuItems, announcements, upcomingStops, upcomingStopsLoading,
    checklistDismissed, showClosed, customerRadius, exploreMode, exploreCenter,
    pendingRedirect, pendingNotificationRoute, isInitialNotificationResponseChecked, lastViewedOwnerUpdates, selectedAdminTruckId, ownerMessages, setSelectedAdminTruckId,
    beginImagePickerSession, endImagePickerSession,
    setShowClosed, setCustomerRadius, setExploreMode, setExploreCenter, setCurrentUser, completeOnboarding,
    refreshCustomerProfile,
    toggleFavorite, addMenuImage,
    removeMenuImage, addTruckImage, addGalleryImage, removeGalleryImage,
    removeTruckImage, updateTruckDetails, goLive, goOffline, getUserTruck, getOwnedTrucks,
    isOwner, isOwnerLoading, refreshOwnedTrucks, fetchReviewsFromSupabase, supabaseOwnedTrucks, addReview,
    addReviewReply, updateReviewReply, deleteReviewReply,
    getReviews, getAverageRating, addMenuItem, updateMenuItem, deleteMenuItem,
    updateOperatingHours, getOperatingHours, isTruckOpenNow, hasHoursSet,
    qrShared, markQrShared, dismissChecklist, incrementView, incrementMenuView, incrementCall,
    incrementNavigation, incrementPhotoView, getTruckAnalytics, addAnnouncement,
    deleteAnnouncement, getAnnouncements, getUpcomingStops, addUpcomingStop,
    getNextUpcomingStopForTruck, getTruckActivityStatus, getTruckActivitySummary, isTruckInactive,
    updateUpcomingStop, deleteUpcomingStop, fetchUpcomingStopsFromSupabase,
    setTruckVerified, logout,
    incrementQrScan, getQrScanStats, allTrucksLoading, fetchAllTrucksFromSupabase, isProfileComplete,
    getDaysAgoText, setPendingRedirect, setPendingNotificationRoute, setIsInitialNotificationResponseChecked, consumePendingRedirect, getTeamUpdates,
    markOwnerUpdatesViewed, hasUnreadOwnerUpdates, refreshOwnerMessages, createOwnerMessage, formatOperatingHours,
  ]);
});

export function useFilteredTrucks(searchQuery: string, cuisineFilter: string, openOnly: boolean) {
  const { currentUser, foodTrucks, isTruckOpenNow, isTruckInactive } = useApp();
  const lastDebugSignatureRef = useRef<string>('');

  return useMemo(() => {
    const notArchived = foodTrucks.filter(truck =>
      truck.archived !== true && !truck.archivedAt
    );
    const notTest = notArchived.filter(truck => truck.is_test !== true);
    const notInactive = notTest.filter(truck => !isTruckInactive(truck.id));
    const completeOrAllowed = notInactive.filter(truck =>
      canViewIncompleteTruckProfile(truck, currentUser)
    );
    const incompleteFiltered = notInactive.filter(truck =>
      !canViewIncompleteTruckProfile(truck, currentUser)
    );
    let filtered = completeOrAllowed;

    if (openOnly) {
      filtered = filtered.filter(truck => isTruckOpenNow(truck.id));
    }

    const afterOpenOnly = filtered;

    if (cuisineFilter && cuisineFilter !== 'All') {
      filtered = filtered.filter(truck => truck.cuisine_type === cuisineFilter);
    }

    const afterCuisine = filtered;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(truck => {
        const matchesName = truck.name.toLowerCase().includes(query);
        const matchesCuisine = truck.cuisine_type.toLowerCase().includes(query);
        const matchesBio = truck.bio.toLowerCase().includes(query);
        const matchesKeywords = truck.search_keywords?.some(keyword => 
          keyword.toLowerCase().includes(query)
        ) || false;
        
        return matchesName || matchesCuisine || matchesBio || matchesKeywords;
      });
    }

    if (__DEV__) {
      const incompleteSamples = incompleteFiltered.slice(0, 12).map(truck => ({
        id: truck.id,
        name: truck.name,
        missing: getPublicReadyStatus(truck).missing,
        ownerAllowed:
          (!!currentUser?.id && truck.owner_id === currentUser.id) ||
          (currentUser?.role === 'truck' && currentUser.truck_id === truck.id),
      }));
      const debugPayload = {
        source: 'useFilteredTrucks',
        viewerRole: currentUser?.role ?? 'guest',
        viewerTruckId: currentUser?.truck_id ?? null,
        searchQuery,
        cuisineFilter,
        openOnly,
        totalLoaded: foodTrucks.length,
        validLocationCount: foodTrucks.filter(hasDebugValidLocation).length,
        afterArchivedFilter: notArchived.length,
        archivedFiltered: foodTrucks.length - notArchived.length,
        afterTestFilter: notTest.length,
        testFiltered: notArchived.length - notTest.length,
        afterInactiveFilter: notInactive.length,
        inactiveFiltered: notTest.length - notInactive.length,
        afterIncompleteProfileFilter: completeOrAllowed.length,
        incompleteProfileFiltered: incompleteFiltered.length,
        afterOpenOnlyFilter: afterOpenOnly.length,
        openOnlyFiltered: completeOrAllowed.length - afterOpenOnly.length,
        afterCuisineFilter: afterCuisine.length,
        cuisineFiltered: afterOpenOnly.length - afterCuisine.length,
        afterSearchFilter: filtered.length,
        searchFiltered: afterCuisine.length - filtered.length,
        incompleteSamples,
      };
      const debugSignature = JSON.stringify(debugPayload);
      if (lastDebugSignatureRef.current !== debugSignature) {
        lastDebugSignatureRef.current = debugSignature;
        console.log('[DiscoverDebug] shared customer truck filter', debugPayload);
      }
    }

    return filtered;
  }, [currentUser, foodTrucks, searchQuery, cuisineFilter, openOnly, isTruckOpenNow, isTruckInactive]);
}

export function useFavoriteTrucks() {
  const { currentUser, foodTrucks, isTruckInactive } = useApp();

  return useMemo(() => {
    if (!currentUser) return [];
    return foodTrucks.filter(truck =>
      currentUser.favorites.includes(truck.id) &&
      truck.archived !== true &&
      !truck.archivedAt &&
      truck.is_test !== true &&
      !isTruckInactive(truck.id) &&
      canViewIncompleteTruckProfile(truck, currentUser)
    );
  }, [currentUser, foodTrucks, isTruckInactive]);
}

export function useTruckReviews(truckId: string) {
  const { reviews } = useApp();

  return useMemo(() => {
    const requestedId = truckId?.toString() ?? '';

    return reviews
      .filter(review => review.truckId?.toString() === requestedId)
      .sort((a, b) => {
        const aTime = Date.parse(a.createdAt || '') || 0;
        const bTime = Date.parse(b.createdAt || '') || 0;
        return bTime - aTime;
      });
  }, [reviews, truckId]);
}

export function useTruckRating(truckId: string) {
  const { reviews } = useApp();

  return useMemo(() => {
    const truckReviews = reviews.filter(review => review.truckId === truckId);
    if (truckReviews.length === 0) return { average: 0, count: 0 };
    
    const sum = truckReviews.reduce((acc, review) => acc + review.rating, 0);
    const average = sum / truckReviews.length;
    
    return { average: Math.round(average * 10) / 10, count: truckReviews.length };
  }, [reviews, truckId]);
}

export function useTruckMenu(truckId: string) {
  const { menuItems } = useApp();

  return useMemo(() => {
    return menuItems.filter(item => item.truck_id === truckId);
  }, [menuItems, truckId]);
}
