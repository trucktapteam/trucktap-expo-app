import { getTruckProfileCompleteness, TruckProfileCompleteness } from '@/lib/truckProfileCompleteness';
import { getPublicReadyStatus, PublicReadyStatus } from '@/lib/truckPublicReady';
import { getMenuBoardImageFromMenuImages } from '@/lib/truckMenu';
import { Announcement, FoodTruck, MenuItem, OwnerMessage, Review, UpcomingStop } from '@/types';

export type TruckHealth = 'Excellent' | 'Good' | 'Needs Attention' | 'Hidden';

export type TruckNextBestAction =
  | 'Add Truck Name'
  | 'Upload Logo'
  | 'Upload Hero Image'
  | 'Add Bio'
  | 'Add Service Area'
  | 'Add Menu'
  | 'Add Gallery Photos'
  | 'Add Operating Hours'
  | 'Go LIVE'
  | 'Add Upcoming Stop'
  | 'Check Messages'
  | 'Add Announcement'
  | 'Respond to Reviews'
  | "Great Job — You're Ready"
  | 'No action available';

export type TruckEventReadiness = 'starts_soon' | 'started' | 'live_ready' | null;

export type TruckChecklistItem = {
  id:
    | 'name'
    | 'logo'
    | 'hero'
    | 'bio'
    | 'service_area'
    | 'menu'
    | 'gallery'
    | 'hours'
    | 'live'
    | 'upcoming_stop'
    | 'messages'
    | 'announcement'
    | 'reviews';
  label: TruckNextBestAction;
  completed: boolean;
};

export type TruckCommandCenterInput = FoodTruck & {
  ownerMessages?: OwnerMessage[];
  announcements?: Announcement[];
  upcomingStops?: UpcomingStop[];
  reviews?: Review[];
  menuItems?: MenuItem[];
  hasOperatingHours?: boolean;
};

export type TruckCommandCenter = {
  health: TruckHealth;
  visibility: string;
  nextAction: TruckNextBestAction;
  checklist: TruckChecklistItem[];
  /** Broader owner/admin coaching completeness (includes service area). Not the visibility gate — see `publicReady`. */
  profileCompleteness: TruckProfileCompleteness;
  /** The canonical customer-visibility gate. `health === 'Hidden'` is driven by this, not `profileCompleteness`. */
  publicReady: PublicReadyStatus;
  eventReadiness: TruckEventReadiness;
};

const ANNOUNCEMENT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
const EVENT_GO_LIVE_WINDOW_MS = 30 * 60 * 1000;

const parseTimestamp = (value?: string | number | null): number | null => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
};

const isFutureStop = (stop: UpcomingStop, now = Date.now()): boolean => {
  if (stop.status === 'cancelled' || stop.status === 'completed') return false;

  const startsAt = parseTimestamp(stop.starts_at);
  return startsAt !== null && startsAt > now;
};

const isActionableStop = (stop: UpcomingStop): boolean =>
  stop.status !== 'cancelled' && stop.status !== 'completed' && stop.status !== 'sold_out';

const isStopStartingSoon = (stop: UpcomingStop, now = Date.now()): boolean => {
  if (!isActionableStop(stop)) return false;

  const startsAt = parseTimestamp(stop.starts_at);
  return startsAt !== null && startsAt > now && startsAt <= now + EVENT_GO_LIVE_WINDOW_MS;
};

const isStopInProgress = (stop: UpcomingStop, now = Date.now()): boolean => {
  if (!isActionableStop(stop)) return false;

  const startsAt = parseTimestamp(stop.starts_at);
  if (startsAt === null || startsAt > now) return false;

  const endsAt = parseTimestamp(stop.ends_at);
  return endsAt === null || endsAt > now;
};

const getEventReadiness = (truck: TruckCommandCenterInput, now = Date.now()): TruckEventReadiness => {
  if (!truck.upcomingStops) return null;

  const relevantStops = truck.upcomingStops.filter(stop =>
    stop.truck_id?.toString() === truck.id?.toString()
  );
  const hasStartedStop = relevantStops.some(stop => isStopInProgress(stop, now));
  const hasSoonStop = relevantStops.some(stop => isStopStartingSoon(stop, now));

  if (!hasStartedStop && !hasSoonStop) return null;
  if (truck.open_now === true) return 'live_ready';

  return hasStartedStop ? 'started' : 'starts_soon';
};

const getAnnouncementExpiresAt = (announcement: Announcement): number => {
  const explicitExpiration = parseTimestamp(announcement.expires_at);
  if (explicitExpiration !== null) return explicitExpiration;

  const createdAt = parseTimestamp(announcement.timestamp);
  return createdAt === null ? 0 : createdAt + ANNOUNCEMENT_EXPIRATION_MS;
};

const isActiveAnnouncement = (announcement: Announcement, now = Date.now()): boolean =>
  getAnnouncementExpiresAt(announcement) > now;

const hasUnreadOwnerMessage = (truck: TruckCommandCenterInput): boolean =>
  (truck.ownerMessages ?? []).some(message => {
    if (message.read_at) return false;
    if (message.target_scope === 'all_trucks') return true;
    return message.target_truck_id?.toString() === truck.id?.toString();
  });

const hasUpcomingStop = (truck: TruckCommandCenterInput): boolean => {
  if (!truck.upcomingStops) return false;

  return truck.upcomingStops.some(stop =>
    stop.truck_id?.toString() === truck.id?.toString() && isFutureStop(stop)
  );
};

const hasServiceArea = (truck: TruckCommandCenterInput): boolean =>
  typeof truck.service_area === 'string' && truck.service_area.trim().length > 0;

const hasBio = (truck: TruckCommandCenterInput): boolean =>
  typeof truck.bio === 'string' && truck.bio.trim().length > 0;

const hasMenuContent = (truck: TruckCommandCenterInput): boolean => {
  const truckMenuItems = truck.menuItems?.filter(item =>
    item.truck_id?.toString() === truck.id?.toString()
  ) ?? [];

  return truckMenuItems.length > 0 || !!getMenuBoardImageFromMenuImages(truck.menu_images);
};

const hasGalleryPhotos = (truck: TruckCommandCenterInput): boolean =>
  Array.isArray(truck.images) &&
  truck.images.filter(image => typeof image === 'string' && image.trim().length > 0).length >= 3;

const hasOperatingHours = (truck: TruckCommandCenterInput): boolean =>
  truck.hasOperatingHours === true ||
  !!truck.operatingHours ||
  (typeof truck.hours === 'string' && truck.hours.trim().length > 0);

const hasActiveAnnouncement = (truck: TruckCommandCenterInput): boolean => {
  if (!truck.announcements) return false;

  return truck.announcements.some(announcement =>
    announcement.truck_id?.toString() === truck.id?.toString() && isActiveAnnouncement(announcement)
  );
};

const hasUnrepliedReview = (truck: TruckCommandCenterInput): boolean => {
  if (!truck.reviews) return false;

  return truck.reviews.some(review =>
    review.truckId?.toString() === truck.id?.toString() && !review.ownerReply
  );
};

export function getVisibilityReason(truck: TruckCommandCenterInput): string {
  if (truck.archived === true || !!truck.archivedAt) return 'Archived';
  if (truck.is_test === true) return 'Test Truck';

  // Public Ready is the actual customer-visibility gate. Service area (and, for
  // legacy trucks, bio) must never be reported as a reason a truck is hidden.
  const publicReady = getPublicReadyStatus(truck);

  if (publicReady.missing.includes('name')) return 'Missing Name';
  if (publicReady.missing.includes('logo')) return 'Missing Logo';
  if (publicReady.missing.includes('hero')) return 'Missing Hero Image';
  if (publicReady.missing.includes('bio')) return 'Missing Bio';

  return 'Profile Complete';
}

export function getNextBestAction(truck: TruckCommandCenterInput): TruckNextBestAction {
  if (truck.archived === true || !!truck.archivedAt || truck.is_test === true) {
    return 'No action available';
  }

  const publicReady = getPublicReadyStatus(truck);

  if (publicReady.missing.includes('name')) return 'Add Truck Name';
  if (publicReady.missing.includes('logo')) return 'Upload Logo';
  if (publicReady.missing.includes('hero')) return 'Upload Hero Image';
  if (publicReady.missing.includes('bio')) return 'Add Bio';
  if (!hasServiceArea(truck)) return 'Add Service Area';
  if (!hasMenuContent(truck)) return 'Add Menu';
  if (!hasGalleryPhotos(truck)) return 'Add Gallery Photos';
  if (!hasOperatingHours(truck)) return 'Add Operating Hours';
  if (truck.upcomingStops && !hasUpcomingStop(truck)) return 'Add Upcoming Stop';
  if (getEventReadiness(truck) === 'live_ready') return "Great Job — You're Ready";
  if (!truck.open_now) return 'Go LIVE';
  if (truck.ownerMessages && hasUnreadOwnerMessage(truck)) return 'Check Messages';
  if (truck.announcements && !hasActiveAnnouncement(truck)) return 'Add Announcement';
  if (truck.reviews && hasUnrepliedReview(truck)) return 'Respond to Reviews';

  return "Great Job — You're Ready";
}

export function getTodayChecklist(truck: TruckCommandCenterInput): TruckChecklistItem[] {
  const publicReady = getPublicReadyStatus(truck);
  const checklist: TruckChecklistItem[] = [
    {
      id: 'name',
      label: 'Add Truck Name',
      completed: !publicReady.missing.includes('name'),
    },
    {
      id: 'logo',
      label: 'Upload Logo',
      completed: !publicReady.missing.includes('logo'),
    },
    {
      id: 'hero',
      label: 'Upload Hero Image',
      completed: !publicReady.missing.includes('hero'),
    },
    {
      id: 'bio',
      label: 'Add Bio',
      completed: hasBio(truck),
    },
    {
      id: 'service_area',
      label: 'Add Service Area',
      completed: hasServiceArea(truck),
    },
    {
      id: 'menu',
      label: 'Add Menu',
      completed: hasMenuContent(truck),
    },
    {
      id: 'gallery',
      label: 'Add Gallery Photos',
      completed: hasGalleryPhotos(truck),
    },
    {
      id: 'hours',
      label: 'Add Operating Hours',
      completed: hasOperatingHours(truck),
    },
    {
      id: 'live',
      label: 'Go LIVE',
      completed: truck.open_now === true,
    },
  ];

  if (truck.upcomingStops) {
    checklist.push({
      id: 'upcoming_stop',
      label: 'Add Upcoming Stop',
      completed: hasUpcomingStop(truck),
    });
  }

  if (truck.ownerMessages) {
    checklist.push({
      id: 'messages',
      label: 'Check Messages',
      completed: !hasUnreadOwnerMessage(truck),
    });
  }

  if (truck.announcements) {
    checklist.push({
      id: 'announcement',
      label: 'Add Announcement',
      completed: hasActiveAnnouncement(truck),
    });
  }

  if (truck.reviews) {
    checklist.push({
      id: 'reviews',
      label: 'Respond to Reviews',
      completed: !hasUnrepliedReview(truck),
    });
  }

  return checklist;
}

export function getTruckHealth(truck: TruckCommandCenterInput): TruckHealth {
  const publicReady = getPublicReadyStatus(truck);

  if (truck.archived === true || !!truck.archivedAt || truck.is_test === true || !publicReady.complete) {
    return 'Hidden';
  }

  const checklist = getTodayChecklist(truck);
  const incompleteCount = checklist.filter(item => !item.completed).length;

  if (incompleteCount === 0) return 'Excellent';
  if (incompleteCount <= 2) return 'Good';
  return 'Needs Attention';
}

export function getTruckCommandCenter(truck: TruckCommandCenterInput): TruckCommandCenter {
  const profileCompleteness = getTruckProfileCompleteness(truck);
  const publicReady = getPublicReadyStatus(truck);
  const eventReadiness = getEventReadiness(truck);

  return {
    health: getTruckHealth(truck),
    visibility: getVisibilityReason(truck),
    nextAction: getNextBestAction(truck),
    checklist: getTodayChecklist(truck),
    profileCompleteness,
    publicReady,
    eventReadiness,
  };
}
