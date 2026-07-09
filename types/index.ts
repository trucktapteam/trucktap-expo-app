export * from './qr';

export type UserRole = 'admin' | 'customer' | 'truck';

export type User = {
  id: string;
  name: string;
  profile_photo?: string;
  role: UserRole;
  truck_id?: string;
  favorites: string[];
  email?: string;
};

export type FoodTruck = {
  id: string;
  name: string;
  owner_id: string;
  hero_image: string;
  logo: string;
  cuisine_type: string;
  menu_images: string[];
  images: string[];
  open_now: boolean;
  location: {
    latitude: number;
    longitude: number;
    address: string;
  };
  hours: string;
  bio: string;
  phone: string;
  website?: string;
  facebook_url?: string;
  instagram_url?: string;
  tiktok_url?: string;
  service_area?: string;
  trust_badges?: string[];
  operatingHours?: OperatingHours;
  verified: boolean;
  lastUpdated?: string;
  lastLiveUpdatedAt?: string;
  liveStartedAt?: string | null;
  liveExpiresAt?: string | null;
  liveSource?: string | null;
  search_keywords?: string[];
  analytics?: {
    views: number;
    favorites: number;
    menuViews: number;
    calls: number;
    navigations: number;
    photoViews: number;
    qrScans: number;
    lastQrScan?: string;
  };
  archived?: boolean;
  archivedAt?: string | number;
  archiveReason?: string;
  is_test?: boolean;
  lastOwnerActivityAt?: number;
};

export type Sighting = {
  id: string;
  truck_name: string;
  photo_url?: string | null;
  user_id?: string | null;
  spotted_by_name?: string | null;
  latitude: number;
  longitude: number;
  notes?: string | null;
  created_at: string;
  expires_at: string;
};

export type Review = {
  id: string;
  truckId: string;
  rating: number;
  text: string;
  createdAt: string;
  ownerReply?: ReviewReply | null;
  user: {
    id: string;
    name: string;
    profile_photo?: string;
  };
};

export type ReviewReply = {
  id: string;
  reviewId: string;
  truckId: string;
  body: string;
  createdAt: string;
  updatedAt: string;
};

export type MenuItem = {
  id: string;
  truck_id: string;
  name: string;
  description: string;
  price: number;
  category?: string;
  image?: string;
  available: boolean;
};

export type OperatingHours = {
  [day: string]: { open: string; close: string; closed: boolean };
};

export type Announcement = {
  id: string;
  truck_id: string;
  message: string;
  timestamp: string;
  expires_at?: string;
};

export type UpcomingStopStatus = 'scheduled' | 'delayed' | 'cancelled' | 'sold_out' | 'completed';

export type UpcomingStop = {
  id: string;
  truck_id: string;
  starts_at: string;
  ends_at: string;
  location_text: string;
  note?: string | null;
  status: UpcomingStopStatus;
  created_at?: string;
  updated_at?: string;
};

export type TeamUpdate = {
  id: string;
  title: string;
  body: string;
  date: string;
  important: boolean;
};

export type OwnerMessageType = 'general' | 'important' | 'maintenance' | 'urgent';

export type OwnerMessage = {
  id: string;
  title: string;
  body: string;
  type: OwnerMessageType;
  created_by?: string | null;
  created_at: string;
  target_scope: 'all_trucks' | 'truck';
  target_truck_id?: string | null;
  read_at?: string | null;
};
