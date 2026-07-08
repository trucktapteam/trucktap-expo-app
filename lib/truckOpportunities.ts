import { Announcement, FoodTruck, MenuItem, Review, UpcomingStop } from '@/types';

export type TruckOpportunityPriority = 'high' | 'medium' | 'low';

export type TruckOpportunityAction =
  | 'gallery'
  | 'announcement'
  | 'schedule'
  | 'reviews'
  | 'menu'
  | 'goLive'
  | 'none';

export type TruckOpportunity = {
  id: string;
  priority: TruckOpportunityPriority;
  icon: string;
  title: string;
  description: string;
  action: TruckOpportunityAction;
};

export type TruckOpportunitiesInput = FoodTruck & {
  announcements?: Announcement[];
  menuItems?: MenuItem[];
  reviews?: Review[];
  upcomingStops?: UpcomingStop[];
};

type SortableTruckOpportunity = TruckOpportunity & {
  recommendationPriority: TruckOpportunityPriority;
};

const ANNOUNCEMENT_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
// Opportunity cadence only; public active/inactive visibility uses separate app logic.
const RECENT_LIVE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const priorityOrder: Record<TruckOpportunityPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

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

const isTruckScoped = (
  itemTruckId: string | number | null | undefined,
  truckId: string | number | null | undefined
): boolean => itemTruckId?.toString() === truckId?.toString();

const isFutureStop = (stop: UpcomingStop, now = Date.now()): boolean => {
  if (stop.status === 'cancelled' || stop.status === 'completed') return false;

  const startsAt = parseTimestamp(stop.starts_at);
  return startsAt !== null && startsAt > now;
};

const getAnnouncementExpiresAt = (announcement: Announcement): number => {
  const explicitExpiration = parseTimestamp(announcement.expires_at);
  if (explicitExpiration !== null) return explicitExpiration;

  const createdAt = parseTimestamp(announcement.timestamp);
  return createdAt === null ? 0 : createdAt + ANNOUNCEMENT_EXPIRATION_MS;
};

const isActiveAnnouncement = (announcement: Announcement, now = Date.now()): boolean =>
  getAnnouncementExpiresAt(announcement) > now;

const hasUpcomingStop = (truck: TruckOpportunitiesInput, now = Date.now()): boolean =>
  (truck.upcomingStops ?? []).some(stop =>
    isTruckScoped(stop.truck_id, truck.id) && isFutureStop(stop, now)
  );

const hasActiveAnnouncement = (truck: TruckOpportunitiesInput, now = Date.now()): boolean =>
  (truck.announcements ?? []).some(announcement =>
    isTruckScoped(announcement.truck_id, truck.id) && isActiveAnnouncement(announcement, now)
  );

const getVisibleMenuItemCount = (truck: TruckOpportunitiesInput): number =>
  (truck.menuItems ?? []).filter(item =>
    isTruckScoped(item.truck_id, truck.id) && item.available !== false
  ).length;

const hasReviewNeedingReply = (truck: TruckOpportunitiesInput): boolean =>
  (truck.reviews ?? []).some(review =>
    isTruckScoped(review.truckId, truck.id) && !review.ownerReply
  );

const hasGoneLiveRecently = (truck: TruckOpportunitiesInput, now = Date.now()): boolean => {
  if (truck.open_now === true) return true;

  const lastLiveAt = parseTimestamp(truck.lastLiveUpdatedAt);
  return lastLiveAt !== null && now - lastLiveAt <= RECENT_LIVE_WINDOW_MS;
};

export function getTruckOpportunities(truck: TruckOpportunitiesInput): TruckOpportunity[] {
  if (truck.archived === true || !!truck.archivedAt || truck.is_test === true) {
    return [];
  }

  const opportunities: SortableTruckOpportunity[] = [];

  if (truck.upcomingStops && !hasUpcomingStop(truck)) {
    opportunities.push({
      id: 'add-next-stop',
      priority: 'high',
      recommendationPriority: 'high',
      icon: 'calendar-plus',
      title: 'Add your next stop',
      description: "Followers love knowing where you'll be next.",
      action: 'schedule',
    });
  }

  if (truck.announcements && !hasActiveAnnouncement(truck)) {
    opportunities.push({
      id: 'share-announcement',
      priority: 'medium',
      recommendationPriority: 'high',
      icon: 'megaphone',
      title: 'Share an announcement',
      description: 'Keep followers engaged between events.',
      action: 'announcement',
    });
  }

  if (Array.isArray(truck.images) && truck.images.length < 5) {
    opportunities.push({
      id: 'add-gallery-photos',
      priority: 'high',
      recommendationPriority: 'medium',
      icon: 'images',
      title: 'Add more photos',
      description: 'Customers enjoy seeing your food before they visit.',
      action: 'gallery',
    });
  }

  if (truck.menuItems && getVisibleMenuItemCount(truck) < 5) {
    opportunities.push({
      id: 'expand-menu',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'utensils',
      title: 'Expand your menu',
      description: 'A larger menu helps customers know what you offer.',
      action: 'menu',
    });
  }

  if (truck.reviews && hasReviewNeedingReply(truck)) {
    opportunities.push({
      id: 'reply-to-reviews',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'message-square-reply',
      title: 'Reply to reviews',
      description: 'Customers appreciate hearing back from owners.',
      action: 'reviews',
    });
  }

  if (!hasGoneLiveRecently(truck)) {
    opportunities.push({
      id: 'go-live-more-often',
      priority: 'low',
      recommendationPriority: 'low',
      icon: 'radio',
      title: 'Go LIVE more often',
      description: 'Frequent LIVE activity builds customer trust.',
      action: 'goLive',
    });
  }

  return opportunities
    .sort((a, b) => priorityOrder[a.recommendationPriority] - priorityOrder[b.recommendationPriority])
    .map(({ recommendationPriority, ...opportunity }) => opportunity);
}
