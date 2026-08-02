import type { Announcement, FoodTruck, MenuItem, Review, UpcomingStop } from '@/types';

export type TruckOpportunityPriority = 'high' | 'medium' | 'low';

export type TruckOpportunityAction =
  | 'gallery'
  | 'announcement'
  | 'schedule'
  | 'reviews'
  | 'menu'
  | 'goLive'
  | 'qrCenter'
  | 'checkIns'
  | 'profile'
  | 'none';

export type TruckOpportunity = {
  id: string;
  priority: TruckOpportunityPriority;
  icon: string;
  title: string;
  description: string;
  /** Longer "why this matters" copy - shown when this opportunity becomes Today's Mission, and behind a "Learn more" on the card itself. */
  why: string;
  /** Optional short bullet list - QR placement ideas, announcement examples, a suggested script, etc. */
  tips?: string[];
  action: TruckOpportunityAction;
};

export type TruckOpportunitiesInput = FoodTruck & {
  announcements?: Announcement[];
  menuItems?: MenuItem[];
  reviews?: Review[];
  upcomingStops?: UpcomingStop[];
  qrShared?: boolean;
  hasOperatingHours?: boolean;
  /** Real, already-computed check-in count for the current calendar month (see contexts/AppContext.tsx getTruckAnalytics). */
  customerCheckInsThisMonth?: number;
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

const hasBioText = (truck: TruckOpportunitiesInput): boolean =>
  typeof truck.bio === 'string' && truck.bio.trim().length > 0;

const hasServiceAreaText = (truck: TruckOpportunitiesInput): boolean =>
  typeof truck.service_area === 'string' && truck.service_area.trim().length > 0;

const hasOperatingHoursSet = (truck: TruckOpportunitiesInput): boolean =>
  truck.hasOperatingHours === true ||
  !!truck.operatingHours ||
  (typeof truck.hours === 'string' && truck.hours.trim().length > 0);

const hasUncheckedInCustomersThisMonth = (truck: TruckOpportunitiesInput): boolean =>
  (truck.customerCheckInsThisMonth ?? 0) === 0;

export function getTruckOpportunities(truck: TruckOpportunitiesInput): TruckOpportunity[] {
  if (truck.archived === true || !!truck.archivedAt || truck.is_test === true) {
    return [];
  }

  const opportunities: SortableTruckOpportunity[] = [];

  if (!truck.qrShared) {
    opportunities.push({
      id: 'put-qr-to-work',
      priority: 'high',
      recommendationPriority: 'high',
      icon: 'qr-code',
      title: 'Put Your QR Code to Work',
      description: 'Every scan turns a walk-up customer into a follower who can find you again.',
      why: "Your QR code sends customers straight to your permanent TruckTap page - the same place every time, not a one-off link. Once someone scans it, they can favorite your truck, view your menu, check upcoming stops, read announcements, get notified the moment you go LIVE, and leave a review. That's the difference between a customer you serve once and a customer who follows you.",
      tips: [
        'On the truck itself, where it’s visible from the line',
        'On your menu board',
        'On the service window',
        'On business cards',
        'On receipts',
        'On signs at events',
        'On table tents, if customers sit nearby',
        'Ask every customer to scan before they leave',
      ],
      action: 'qrCenter',
    });
  }

  if (truck.upcomingStops && !hasUpcomingStop(truck)) {
    opportunities.push({
      id: 'schedule-upcoming-stops',
      priority: 'high',
      recommendationPriority: 'high',
      icon: 'calendar-plus',
      title: 'Schedule Upcoming Stops',
      description: 'Customers plan meals before they get hungry - give them a reason to plan around you.',
      why: 'Most customers decide where to eat before they’re actually hungry. A scheduled stop lets them plan a visit ahead of time instead of hoping to run into you. It also keeps your profile looking active between service days, which builds the kind of consistency that turns a one-time visitor into a regular.',
      action: 'schedule',
    });
  }

  if (!hasGoneLiveRecently(truck)) {
    opportunities.push({
      id: 'go-live-regularly',
      priority: 'high',
      recommendationPriority: 'high',
      icon: 'radio',
      title: 'Go LIVE Regularly',
      description: 'Nearby customers are only notified while you’re LIVE - the more often, the more chances to be found.',
      why: 'Going LIVE is what puts your truck on the map for customers searching right now. Truck owners who go LIVE consistently build trust and habit - customers learn to check TruckTap first because it usually pays off.',
      action: 'goLive',
    });
  }

  if (truck.announcements && !hasActiveAnnouncement(truck)) {
    opportunities.push({
      id: 'share-announcement',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'megaphone',
      title: 'Share an Announcement',
      description: 'A quick update keeps followers engaged between visits.',
      why: 'Announcements give followers a reason to check back even on days you’re not LIVE. They’re most useful when they’re specific and timely rather than generic.',
      tips: [
        'Today’s special: "Smoked brisket tacos today only"',
        'Sold out: "Sold out of the carnitas - see you tomorrow"',
        'Weather delay: "Running late today because of the storm"',
        'Holiday hours: "Closed Monday for the holiday, back Tuesday"',
        'New menu items: "New: spicy mango salsa, try it this week"',
        'Promotions: "Bring a friend Friday - buy one get one on tacos"',
      ],
      action: 'announcement',
    });
  }

  if (hasUncheckedInCustomersThisMonth(truck)) {
    opportunities.push({
      id: 'customer-check-ins',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'check-circle',
      title: 'Encourage Customer Check-Ins',
      description: 'Check-ins prove your traffic and show up in your Business Snapshot.',
      why: 'Every check-in is a customer confirming they found you through TruckTap - it’s the clearest signal you have that the app is bringing you real business. It only takes a reminder to build the habit.',
      tips: ['"Check in on TruckTap before you leave!"'],
      action: 'checkIns',
    });
  }

  if (truck.menuItems && getVisibleMenuItemCount(truck) < 5) {
    opportunities.push({
      id: 'complete-menu',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'utensils',
      title: 'Complete Your Menu',
      description: 'A fuller menu helps customers decide before they arrive.',
      why: 'Customers who browse your menu ahead of time arrive already knowing what they want, which usually means a smoother, faster order for both of you.',
      action: 'menu',
    });
  }

  if (Array.isArray(truck.images) && truck.images.length < 5) {
    opportunities.push({
      id: 'gallery-photos',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'images',
      title: 'Add Gallery Photos',
      description: 'Customers enjoy seeing your food before they visit.',
      why: 'Photos make a profile feel active and trustworthy. A mix of food, truck, and service shots gives customers a real sense of the experience before they show up.',
      action: 'gallery',
    });
  }

  if (truck.reviews && hasReviewNeedingReply(truck)) {
    opportunities.push({
      id: 'reply-to-reviews',
      priority: 'medium',
      recommendationPriority: 'medium',
      icon: 'message-square-reply',
      title: 'Reply to Reviews',
      description: 'Customers appreciate hearing back from owners.',
      why: 'A short, genuine reply shows both that reviewer and everyone reading later that feedback actually reaches you.',
      action: 'reviews',
    });
  }

  const missingPolishCount = [
    !hasBioText(truck),
    !hasServiceAreaText(truck),
    !hasOperatingHoursSet(truck),
  ].filter(Boolean).length;

  if (missingPolishCount > 0) {
    opportunities.push({
      id: 'remaining-profile-polish',
      priority: 'low',
      recommendationPriority: 'low',
      icon: 'sparkles',
      title: 'Finish Your Profile',
      description: missingPolishCount === 1
        ? 'One small detail left to round out your profile.'
        : `${missingPolishCount} small details left to round out your profile.`,
      why: 'Your truck is already visible to customers - this is polish, not a blocker. A bio, service area, and posted hours help set accurate expectations before someone visits.',
      action: 'profile',
    });
  }

  return opportunities
    .sort((a, b) => priorityOrder[a.recommendationPriority] - priorityOrder[b.recommendationPriority])
    .map(({ recommendationPriority, ...opportunity }) => opportunity);
}
