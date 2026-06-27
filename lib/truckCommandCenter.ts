import { getTruckProfileCompleteness, TruckProfileCompleteness } from '@/lib/truckProfileCompleteness';
import { Announcement, FoodTruck, OwnerMessage, Review, UpcomingStop } from '@/types';

export type TruckHealth = 'Excellent' | 'Good' | 'Needs Attention' | 'Hidden';

export type TruckNextBestAction =
  | 'Add Truck Name'
  | 'Upload Logo'
  | 'Upload Hero Image'
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
};

export type TruckCommandCenter = {
  health: TruckHealth;
  visibility: string;
  nextAction: TruckNextBestAction;
  checklist: TruckChecklistItem[];
  profileCompleteness: TruckProfileCompleteness;
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

  const completeness = getTruckProfileCompleteness(truck);

  if (completeness.missing.includes('name')) return 'Missing Name';
  if (completeness.missing.includes('logo')) return 'Missing Logo';
  if (completeness.missing.includes('hero')) return 'Missing Hero Image';

  return 'Profile Complete';
}

export function getNextBestAction(truck: TruckCommandCenterInput): TruckNextBestAction {
  if (truck.archived === true || !!truck.archivedAt || truck.is_test === true) {
    return 'No action available';
  }

  const completeness = getTruckProfileCompleteness(truck);

  if (completeness.missing.includes('name')) return 'Add Truck Name';
  if (completeness.missing.includes('logo')) return 'Upload Logo';
  if (completeness.missing.includes('hero')) return 'Upload Hero Image';
  if (getEventReadiness(truck) === 'live_ready') return "Great Job — You're Ready";
  if (!truck.open_now) return 'Go LIVE';
  if (truck.upcomingStops && !hasUpcomingStop(truck)) return 'Add Upcoming Stop';
  if (truck.ownerMessages && hasUnreadOwnerMessage(truck)) return 'Check Messages';
  if (truck.announcements && !hasActiveAnnouncement(truck)) return 'Add Announcement';
  if (truck.reviews && hasUnrepliedReview(truck)) return 'Respond to Reviews';

  return "Great Job — You're Ready";
}

export function getTodayChecklist(truck: TruckCommandCenterInput): TruckChecklistItem[] {
  const completeness = getTruckProfileCompleteness(truck);
  const checklist: TruckChecklistItem[] = [
    {
      id: 'name',
      label: 'Add Truck Name',
      completed: !completeness.missing.includes('name'),
    },
    {
      id: 'logo',
      label: 'Upload Logo',
      completed: !completeness.missing.includes('logo'),
    },
    {
      id: 'hero',
      label: 'Upload Hero Image',
      completed: !completeness.missing.includes('hero'),
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
  const completeness = getTruckProfileCompleteness(truck);

  if (truck.archived === true || !!truck.archivedAt || truck.is_test === true || !completeness.complete) {
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
  const eventReadiness = getEventReadiness(truck);

  return {
    health: getTruckHealth(truck),
    visibility: getVisibilityReason(truck),
    nextAction: getNextBestAction(truck),
    checklist: getTodayChecklist(truck),
    profileCompleteness,
    eventReadiness,
  };
}
