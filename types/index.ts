export * from './qr';

export type UserRole = 'customer' | 'truck';

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
  operatingHours?: OperatingHours;
  verified: boolean;
  lastUpdated?: string;
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
  archivedAt?: number;
  archiveReason?: string;
  lastOwnerActivityAt?: number;
};

export type Sighting = {
  id: string;
  truck_name: string;
  photo_url?: string | null;
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
  user: {
    id: string;
    name: string;
    profile_photo?: string;
  };
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
};

export type TeamUpdate = {
  id: string;
  title: string;
  body: string;
  date: string;
  important: boolean;
};
