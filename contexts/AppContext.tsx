import createContextHook from '@nkzw/create-context-hook';
import { useState, useCallback, useMemo, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User, FoodTruck, Review, MenuItem, OperatingHours, Announcement, TeamUpdate } from '@/types';
import { teamUpdates } from '@/mocks/data';
import { DEBUG } from '@/constants/debug';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';

const parseJsonArray = (val: any): any[] => {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
};

const mapAppFieldsToDb = (updates: Partial<FoodTruck>): Record<string, any> => {
  const dbUpdates: Record<string, any> = {};

  if (updates.name !== undefined) dbUpdates.name = updates.name;
  if (updates.hero_image !== undefined) dbUpdates.hero_image = updates.hero_image;
  if (updates.logo !== undefined) dbUpdates.logo = updates.logo;
  if (updates.cuisine_type !== undefined) dbUpdates.cuisine_type = updates.cuisine_type;
  if (updates.bio !== undefined) {
    dbUpdates.bio = updates.bio;
    dbUpdates.description = updates.bio;
  }
  if (updates.phone !== undefined) dbUpdates.phone = updates.phone;
  if (updates.website !== undefined) dbUpdates.website = updates.website;
  if (updates.open_now !== undefined) dbUpdates.is_open = updates.open_now;
  if (updates.operatingHours !== undefined) dbUpdates.operating_hours = updates.operatingHours;
  if (updates.images !== undefined) dbUpdates.gallery_images = updates.images;
  if (updates.menu_images !== undefined) dbUpdates.menu_images = updates.menu_images;

  return dbUpdates;
};

export type AppState = {
  currentUser: User | null;
  isOnboarded: boolean;
  foodTrucks: FoodTruck[];
  reviews: Review[];
  menuItems: MenuItem[];
  announcements: Announcement[];
  checklistDismissed: boolean;
  showClosed: boolean;
  customerRadius: number;
  exploreMode: boolean;
  exploreCenter: { latitude: number; longitude: number; label?: string } | null;
  pendingRedirect: string | null;
  lastViewedOwnerUpdates: string | null;
  setShowClosed: (value: boolean) => void;
  setCustomerRadius: (value: number) => void;
  setExploreMode: (value: boolean) => void;
  setExploreCenter: (center: { latitude: number; longitude: number; label?: string } | null) => void;
  setCurrentUser: (user: User) => void;
  completeOnboarding: () => void;
  refreshCustomerProfile: () => Promise<void>;
  toggleFavorite: (truckId: string) => void;
  addMenuImage: (truckId: string, imageUrl: string) => void;
  removeMenuImage: (truckId: string, imageUrl: string) => void;
  addTruckImage: (truckId: string, imageUrl: string) => void;
  removeTruckImage: (truckId: string, imageUrl: string) => void;
  updateTruckDetails: (truckId: string, updates: Partial<FoodTruck>) => Promise<void>;
  getUserTruck: () => FoodTruck | null;
  getOwnedTrucks: () => FoodTruck[];
  isOwner: boolean;
  isOwnerLoading: boolean;
  refreshOwnedTrucks: () => Promise<void>;
  addReview: (truckId: string, rating: number, text: string) => void;
  getReviews: (truckId: string) => Review[];
  getAverageRating: (truckId: string) => { average: number; count: number };
  addMenuItem: (item: Omit<MenuItem, 'id'>) => void;
  updateMenuItem: (itemId: string, updates: Partial<MenuItem>) => void;
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
  };
  incrementQrScan: (truckId: string, platform: string) => void;
  getQrScanStats: (truckId: string) => { totalScans: number; lastScanned?: string; };
  addAnnouncement: (truckId: string, message: string) => void;
  deleteAnnouncement: (announcementId: string) => void;
  getAnnouncements: (truckId: string) => Announcement[];
  setTruckVerified: (truckId: string, value: boolean) => void;
  dismissChecklist: () => void;
  hasHoursSet: (truckId: string) => boolean;
  qrShared: boolean;
  markQrShared: () => void;
  addGalleryImage: (truckId: string, imageUrl: string) => void;
  removeGalleryImage: (truckId: string, imageUrl: string) => void;
  logout: () => void;
  isProfileComplete: (truckId: string) => boolean;
  getDaysAgoText: (isoDate: string | undefined) => string;
  allTrucksLoading: boolean;
  refreshAllTrucks: () => Promise<void>;
  setPendingRedirect: (route: string | null) => void;
  consumePendingRedirect: () => string | null;
  getTeamUpdates: () => TeamUpdate[];
  markOwnerUpdatesViewed: () => void;
  hasUnreadOwnerUpdates: () => boolean;
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
  const [checklistDismissed, setChecklistDismissed] = useState<boolean>(false);
  const [showClosed, setShowClosedState] = useState<boolean>(false);
  const [customerRadius, setCustomerRadiusState] = useState<number>(25);
  const [exploreMode, setExploreModeState] = useState<boolean>(false);
  const [exploreCenter, setExploreCenterState] = useState<{ latitude: number; longitude: number; label?: string } | null>(null);
  const [pendingRedirect, setPendingRedirectState] = useState<string | null>(null);
  const [lastViewedOwnerUpdates, setLastViewedOwnerUpdates] = useState<string | null>(null);
  const [supabaseOwnedTrucks, setSupabaseOwnedTrucks] = useState<FoodTruck[]>([]);
  const [isOwnerLoading, setIsOwnerLoading] = useState<boolean>(true);
  const [qrShared, setQrShared] = useState<boolean>(false);

  // Helper to check if current user owns a truck
  const userOwnsTruck = useCallback((truckId: string): boolean => {
    if (!isAuthenticated || !authUser) {
      return false;
    }
    const truck = [...supabaseOwnedTrucks, ...foodTrucks].find(t => t.id === truckId);
    if (!truck) {
      return false;
    }
    return truck.owner_id === authUser.id;
  }, [isAuthenticated, authUser, supabaseOwnedTrucks, foodTrucks]);

  const mapSupabaseTruckToLocal = useCallback((row: any): FoodTruck => {
    if (DEBUG) console.log('[AppContext] mapSupabaseTruckToLocal raw row.id:', row.id, 'raw row.is_open:', row.is_open, '(type:', typeof row.is_open, ')');
    const galleryImages = parseJsonArray(row.gallery_images);
    const menuImages = parseJsonArray(row.menu_images);
    if (DEBUG) console.log('[AppContext] mapSupabaseTruckToLocal gallery_images count:', galleryImages.length, 'menu_images count:', menuImages.length);
    return {
      id: row.id?.toString() ?? '',
      name: row.name ?? '',
      owner_id: row.owner_id ?? '',
      hero_image: row.hero_image ?? 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=800',
      logo: row.logo ?? 'https://images.unsplash.com/photo-1565123409695-7b5ef63a2efb?w=200',
      cuisine_type: row.cuisine_type ?? 'Unspecified',
      menu_images: menuImages,
      images: galleryImages,
      open_now: row.is_open ?? false,
      location: {
        latitude: row.latitude ?? 0,
        longitude: row.longitude ?? 0,
        address: row.address ?? '',
      },
      hours: 'Not set',
      bio: row.bio ?? row.description ?? '',
      phone: row.phone ?? '',
      website: row.website ?? '',
      operatingHours: row.operating_hours ?? undefined,
      verified: false,
      lastUpdated: row.updated_at ?? row.created_at ?? undefined,
      search_keywords: [],
      analytics: undefined,
      archived: false,
    };
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

    const mappedReviews: Review[] = (reviewRows ?? []).map((row: any) => {
      const profile = profilesById[row.user_id];

      return {
        id: row.id,
        truckId: row.truck_id,
        rating: row.rating,
        text: row.text,
        createdAt: row.created_at,
        user: {
          id: row.user_id,
          name:
            profile?.display_name ||
           profile?.display_name || 'Food Truck Fan',
          profile_photo: profile?.profile_photo,
        },
      };
    });

    setReviews(mappedReviews);

    if (DEBUG) {
      console.log('[AppContext] Fetched', mappedReviews.length, 'reviews from Supabase');
    }
  } catch (err: any) {
    console.log('[AppContext] Unexpected error fetching reviews:', err?.message);
    setReviews([]);
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
        if (DEBUG) console.log('[AppContext] Fetched', mapped.length, 'trucks from Supabase');
        setFoodTrucks(mapped);

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
              });
            }
          });
        });
        if (DEBUG) console.log('[AppContext] Extracted', extractedMenuItems.length, 'menu items,', extractedAnnouncements.length, 'announcements');
        if (extractedMenuItems.length > 0) {
          setMenuItems(extractedMenuItems);
        }
        setAnnouncements(extractedAnnouncements);
      }
    } catch (err: any) {
      console.log('[AppContext] Unexpected error fetching all trucks:', err?.message);
      setFoodTrucks([]);
    } finally {
      setAllTrucksLoading(false);
    }
  }, [mapSupabaseTruckToLocal]);

  const fetchOwnedTrucksFromSupabase = useCallback(async () => {
    if (!isAuthenticated || !authUser || !isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Skipping owned truck fetch');
      setSupabaseOwnedTrucks([]);
      setIsOwnerLoading(false);
      return;
    }

    if (DEBUG) console.log('[AppContext] Fetching owned trucks for owner_id:', authUser.id);
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
        if (DEBUG) console.log('[AppContext] Fetched', mapped.length, 'owned trucks');
        setSupabaseOwnedTrucks(mapped);
      }
    } catch (err: any) {
      console.log('[AppContext] Unexpected error fetching owned trucks:', err?.message);
      setSupabaseOwnedTrucks([]);
    } finally {
      setIsOwnerLoading(false);
    }
  }, [isAuthenticated, authUser, mapSupabaseTruckToLocal]);

  const refreshOwnedTrucks = useCallback(async () => {
    await fetchOwnedTrucksFromSupabase();
    await fetchAllTrucksFromSupabase();
  }, [fetchOwnedTrucksFromSupabase, fetchAllTrucksFromSupabase]);
  
  useEffect(() => {
  void fetchReviewsFromSupabase();
}, [fetchReviewsFromSupabase]);

  useEffect(() => {
    void fetchAllTrucksFromSupabase();
  }, [fetchAllTrucksFromSupabase]);

  useEffect(() => {
    void fetchOwnedTrucksFromSupabase();
  }, [fetchOwnedTrucksFromSupabase]);

  useEffect(() => {
    const syncAuthWithUserProfile = async () => {
      if (authLoading) {
        if (DEBUG) console.log('[AppContext] Waiting for auth to load');
        return;
      }

      if (isAuthenticated && authUser) {
        if (DEBUG) console.log('[AppContext] Hydrating customer profile from Supabase');
        
        try {
          // Load stored favorites if available (for immediate UI availability)
          let storedFavorites: string[] = [];
          const storedProfile = await AsyncStorage.getItem('userProfile');
          if (storedProfile) {
            try {
              const cached = JSON.parse(storedProfile);
              if (cached.id === authUser.id && Array.isArray(cached.favorites)) {
                storedFavorites = cached.favorites;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          // Try to fetch from Supabase profiles table
          if (isSupabaseConfigured) {
            const { data: profileData, error } = await supabase
              .from('profiles')
              .select('display_name, profile_photo')
              .eq('id', authUser.id)
              .single();

            if (!error && profileData) {
              if (DEBUG) console.log('[AppContext] Loaded customer profile from Supabase');
              const newProfile: User = {
                id: authUser.id,
                name: profileData.display_name || authUser.name,
                profile_photo: profileData.profile_photo,
                role: 'customer' as const,
                favorites: storedFavorites,
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
            role: 'customer' as const,
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
            role: 'customer' as const,
            favorites: [],
          };
          setUserProfile(newProfile);
          await AsyncStorage.setItem('userProfile', JSON.stringify(newProfile));
        }
      } else if (!isAuthenticated) {
        setUserProfile(null);
        if (DEBUG) console.log('[AppContext] Cleared user profile');
      }
    };
    
    void syncAuthWithUserProfile();
  }, [isAuthenticated, authUser, authLoading]);

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
        const { data: profileData, error } = await supabase
          .from('profiles')
          .select('display_name, profile_photo')
          .eq('id', authUser.id)
          .single();

        if (!error && profileData) {
          if (DEBUG) console.log('[AppContext] Refreshed customer profile from Supabase');
          const refreshedProfile: User = {
            id: authUser.id,
            name: profileData.display_name || authUser.name,
            profile_photo: profileData.profile_photo,
            role: 'customer' as const,
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
        role: 'customer' as const,
        favorites: currentFavorites,
      };
      setUserProfile(fallbackProfile);
      await AsyncStorage.setItem('userProfile', JSON.stringify(fallbackProfile));
    } catch (err: any) {
      console.log('[AppContext] Error refreshing profile:', err?.message);
    }
  }, [isAuthenticated, authUser, authLoading, userProfile, isSupabaseConfigured]);

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



  const addMenuImage = useCallback((truckId: string, imageUrl: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => 
        truck.id === truckId 
          ? { ...truck, menu_images: [...truck.menu_images, imageUrl] } 
          : truck
      )
    );
  }, []);

  const removeMenuImage = useCallback((truckId: string, imageUrl: string) => {
    setFoodTrucks(prev => 
      prev.map(truck => 
        truck.id === truckId 
          ? { ...truck, menu_images: truck.menu_images.filter(img => img !== imageUrl) } 
          : truck
      )
    );
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

  const updateTruckDetails = useCallback(async (truckId: string, updates: Partial<FoodTruck>) => {
    if (!isAuthenticated || !authUser) {
  if (DEBUG) console.log('[AppContext] blocked - not authenticated');
  throw new Error('Not authenticated');
}
if (!userOwnsTruck(truckId)) {
  if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
  throw new Error(`User does not own truck ${truckId}`);
}
    if (DEBUG) console.log('[AppContext] updateTruckDetails for:', truckId, 'keys:', Object.keys(updates));

    setFoodTrucks(prev =>
      prev.map(truck =>
        truck.id === truckId ? { ...truck, ...updates } : truck
      )
    );
    setSupabaseOwnedTrucks(prev =>
      prev.map(truck =>
        truck.id === truckId ? { ...truck, ...updates } : truck
      )
    );


    if (!isSupabaseConfigured) {
      if (DEBUG) console.log('[AppContext] Supabase not configured, skipping DB write');
      return;
    }

    const dbUpdates = mapAppFieldsToDb(updates);
    dbUpdates.updated_at = new Date().toISOString();

    const persistableKeys = Object.keys(dbUpdates).filter(k => k !== 'updated_at');
    if (DEBUG) console.log('[AppContext] DB payload keys:', persistableKeys.join(', '));

    if (persistableKeys.length > 0) {
      const { error, data } = await supabase
        .from('trucks')
        .update(dbUpdates)
        .eq('id', truckId)
        .eq('owner_id', authUser.id)
        .select();

      if (error) {
        console.log('[AppContext] Truck update error:', error.message);
        throw new Error(`Failed to update truck: ${error.message}`);
      }
      if (DEBUG) console.log('[AppContext] Truck update success, rows:', data?.length ?? 0);
    }

    if (updates.location) {
      if (DEBUG) console.log('[AppContext] Upserting location for truck:', truckId);
      const { error: locError } = await supabase
        .from('locations')
        .upsert(
          {
            truck_id: truckId,
            latitude: updates.location.latitude,
            longitude: updates.location.longitude,
            address: updates.location.address,
          },
          { onConflict: 'truck_id' }
        );

      if (locError) {
        console.log('[AppContext] Location upsert error:', locError.message);
        throw new Error(`Failed to update location: ${locError.message}`);
      }

    }


    const { data: refreshedRow, error: fetchErr } = await supabase
      .from('trucks')
      .select('*')
      .eq('id', truckId)
      .single();

    if (fetchErr) {
      console.log('[AppContext] Post-save re-fetch error:', fetchErr.message);
      return;
    }

    if (refreshedRow) {
      const hydrated = mapSupabaseTruckToLocal(refreshedRow);


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

    }
  }, [isAuthenticated, authUser, userOwnsTruck, mapSupabaseTruckToLocal]);

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

  const isOwner = useMemo(() => {
    if (!isAuthenticated || !authUser) return false;
    if (supabaseOwnedTrucks.length > 0) return true;
    return foodTrucks.some(truck => truck.owner_id === authUser.id);
  }, [isAuthenticated, authUser, foodTrucks, supabaseOwnedTrucks]);

  const getUserTruck = useCallback(() => {
    if (!isAuthenticated || !authUser) return null;
    const owned = supabaseOwnedTrucks.length > 0
      ? supabaseOwnedTrucks
      : foodTrucks.filter(truck => truck.owner_id === authUser.id);
    if (owned.length === 0) return null;
    if (currentUser?.truck_id) {
      const selected = owned.find(t => t.id === currentUser.truck_id);
      if (selected) return selected;
    }
    return owned[0];
  }, [isAuthenticated, authUser, currentUser, foodTrucks, supabaseOwnedTrucks]);

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

  const persistMenuItemsToSupabase = useCallback((truckId: string, items: MenuItem[]) => {
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
    supabase
      .from('trucks')
      .update({ menu_items: items, updated_at: new Date().toISOString() })
      .eq('id', truckId)
      .eq('owner_id', authUser.id)
      .then(({ error }) => {
        if (error) console.log('[AppContext] Error persisting menu items:', error.message);
      });
  }, [isAuthenticated, authUser, userOwnsTruck]);

  const persistAnnouncementsToSupabase = useCallback(async (truckId: string, items: Announcement[]) => {
  if (!isAuthenticated || !authUser) {
    if (DEBUG) console.log('[AppContext] blocked - not authenticated');
    return;
  }

  if (!userOwnsTruck(truckId)) {
    if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', truckId);
    return;
  }

  if (!isSupabaseConfigured) return;

  if (DEBUG) console.log('[AppContext] Persisting announcements for truck:', truckId);

  const { error } = await supabase
    .from('trucks')
    .update({ announcements: items, updated_at: new Date().toISOString() })
    .eq('id', truckId)
    .eq('owner_id', authUser.id);

  if (error) {
    console.log('[AppContext] Error persisting announcements:', error.message);
    return;
  }

  // Only notify when there is at least one announcement present
  if (items.length > 0) {
    const latestAnnouncement = items[0];

    try {
      const { error: fnError } = await supabase.functions.invoke('notify-truck-announcement', {
        body: {
          truckId,
          message: latestAnnouncement.message,
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

  const addMenuItem = useCallback((item: Omit<MenuItem, 'id'>) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    if (!userOwnsTruck(item.truck_id)) {
      if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', item.truck_id);
      return;
    }
    const newItem: MenuItem = {
      ...item,
      id: `menu-${Date.now()}`,
    };
    setMenuItems(prev => {
      const updated = [...prev, newItem];
      const truckItems = updated.filter(i => i.truck_id === item.truck_id);
      persistMenuItemsToSupabase(item.truck_id, truckItems);
      return updated;
    });
  }, [isAuthenticated, authUser, userOwnsTruck, persistMenuItemsToSupabase]);

  const updateMenuItem = useCallback((itemId: string, updates: Partial<MenuItem>) => {
    if (!isAuthenticated || !authUser) {
      if (DEBUG) console.log('[AppContext] blocked - not authenticated');
      return;
    }
    setMenuItems(prev => {
      const changedItem = prev.find(i => i.id === itemId);
      if (changedItem && !userOwnsTruck(changedItem.truck_id)) {
        if (DEBUG) console.log('[AppContext] blocked - user does not own truck:', changedItem.truck_id);
        return prev;
      }
      const updated = prev.map(item =>
        item.id === itemId ? { ...item, ...updates } : item
      );
      const updatedItem = updated.find(i => i.id === itemId);
      if (updatedItem) {
        const truckItems = updated.filter(i => i.truck_id === updatedItem.truck_id);
        persistMenuItemsToSupabase(updatedItem.truck_id, truckItems);
      }
      return updated;
    });
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
    // This field is controlled by the truck dashboard toggle
    // Discover/Home filters use ONLY this boolean (true = Open Now, false = Closed)
    return truck?.open_now || false;
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
    return { ...analytics, favorites: favoritesCount };
  }, [foodTrucks, currentUser]);

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
    };
    if (DEBUG) console.log('[AppContext] addAnnouncement for truck:', truckId);
    setAnnouncements(prev => {
      const updated = [newAnnouncement, ...prev];
      const truckAnnouncements = updated.filter(a => a.truck_id === truckId);
      persistAnnouncementsToSupabase(truckId, truckAnnouncements);
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
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [announcements]);

  const setTruckVerified = useCallback((truckId: string, value: boolean) => {
    setFoodTrucks(prev => 
      prev.map(truck => 
        truck.id === truckId ? { ...truck, verified: value } : truck
      )
    );
  }, []);

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
    setUserProfile(null);
    try {
      await AsyncStorage.multiRemove(['userProfile', 'authUser']);
      if (isSupabaseConfigured) {
        await supabase.auth.signOut();
  
      }
      if (DEBUG) console.log('[AppContext] Logged out, cleared storage');
    } catch (error) {
      console.log('[AppContext] Error during logout:', error);
    }
  }, []);

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

  const getTeamUpdates = useCallback(() => {
    return teamUpdates.sort((a, b) => {
      if (a.important !== b.important) {
        return a.important ? -1 : 1;
      }
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, []);

  const markOwnerUpdatesViewed = useCallback(() => {
    const now = new Date().toISOString();
    setLastViewedOwnerUpdates(now);
    void AsyncStorage.setItem('lastViewedOwnerUpdates', JSON.stringify(now));

  }, []);

  const hasUnreadOwnerUpdates = useCallback(() => {
    if (!lastViewedOwnerUpdates) return teamUpdates.length > 0;
    
    const lastViewed = new Date(lastViewedOwnerUpdates);
    return teamUpdates.some(update => {
      const updateDate = new Date(update.date);
      return updateDate > lastViewed;
    });
  }, [lastViewedOwnerUpdates]);

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
    checklistDismissed,
    showClosed,
    customerRadius,
    exploreMode,
    exploreCenter,
    pendingRedirect,
    lastViewedOwnerUpdates,
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
    getUserTruck,
    getOwnedTrucks,
    isOwner,
    isOwnerLoading,
    refreshOwnedTrucks,
    supabaseOwnedTrucks,
    addReview,
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
    setTruckVerified,
    logout,
    incrementQrScan,
    getQrScanStats,
    allTrucksLoading,
    refreshAllTrucks: fetchAllTrucksFromSupabase,
    isProfileComplete,
    getDaysAgoText,
    setPendingRedirect,
    consumePendingRedirect,
    getTeamUpdates,
    markOwnerUpdatesViewed,
    hasUnreadOwnerUpdates,
    formatOperatingHours,
  }), [
    currentUser, isOnboarded, foodTrucks, reviews, menuItems, announcements,
    checklistDismissed, showClosed, customerRadius, exploreMode, exploreCenter,
    pendingRedirect, lastViewedOwnerUpdates, setShowClosed, setCustomerRadius,
    setExploreMode, setExploreCenter, setCurrentUser, completeOnboarding,
    toggleFavorite, addMenuImage,
    removeMenuImage, addTruckImage, addGalleryImage, removeGalleryImage,
    removeTruckImage, updateTruckDetails, getUserTruck, getOwnedTrucks,
    isOwner, isOwnerLoading, refreshOwnedTrucks, supabaseOwnedTrucks, addReview,
    getReviews, getAverageRating, addMenuItem, updateMenuItem, deleteMenuItem,
    updateOperatingHours, getOperatingHours, isTruckOpenNow, hasHoursSet,
    qrShared, markQrShared, dismissChecklist, incrementView, incrementMenuView, incrementCall,
    incrementNavigation, incrementPhotoView, getTruckAnalytics, addAnnouncement,
    deleteAnnouncement, getAnnouncements, setTruckVerified, logout,
    incrementQrScan, getQrScanStats, allTrucksLoading, fetchAllTrucksFromSupabase, isProfileComplete,
    getDaysAgoText, setPendingRedirect, consumePendingRedirect, getTeamUpdates,
    markOwnerUpdatesViewed, hasUnreadOwnerUpdates, formatOperatingHours,
  ]);
});

export function useFilteredTrucks(searchQuery: string, cuisineFilter: string, openOnly: boolean) {
  const { foodTrucks, isTruckOpenNow } = useApp();

  return useMemo(() => {
    let filtered = [...foodTrucks];

    if (openOnly) {
      filtered = filtered.filter(truck => isTruckOpenNow(truck.id));
    }

    if (cuisineFilter && cuisineFilter !== 'All') {
      filtered = filtered.filter(truck => truck.cuisine_type === cuisineFilter);
    }

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

    return filtered;
  }, [foodTrucks, searchQuery, cuisineFilter, openOnly, isTruckOpenNow]);
}

export function useFavoriteTrucks() {
  const { currentUser, foodTrucks } = useApp();

  return useMemo(() => {
    if (!currentUser) return [];
    return foodTrucks.filter(truck => currentUser.favorites.includes(truck.id));
  }, [currentUser, foodTrucks]);
}

export function useTruckReviews(truckId: string) {
  const { reviews } = useApp();

  return useMemo(() => {
    return reviews.filter(review => review.truckId === truckId).sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
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
