import { DEFAULT_TRUCK_HERO_IMAGE, DEFAULT_TRUCK_LOGO_IMAGE } from '@/constants/truckDefaults';
import { Announcement, FoodTruck, MenuItem, Review, UpcomingStop } from '@/types';

export type TruckCelebrationType =
  | 'logo_added'
  | 'hero_image_added'
  | 'profile_became_visible'
  | 'first_upcoming_stop_added'
  | 'first_announcement_added'
  | 'first_menu_item_added'
  | 'first_gallery_photo_added'
  | 'first_follower_added'
  | 'first_review_added';

export type TruckCelebration = {
  title: string;
  message: string;
  type: TruckCelebrationType;
};

export type TruckCelebrationSnapshot = FoodTruck & {
  upcomingStops?: UpcomingStop[];
  upcomingStopCount?: number;
  announcements?: Announcement[];
  announcementCount?: number;
  menuItems?: MenuItem[];
  menuItemCount?: number;
  reviews?: Review[];
  reviewCount?: number;
  followers?: unknown[];
  followerCount?: number;
  favoritesCount?: number;
};

const normalize = (value?: string | null): string => value?.trim() ?? '';

const isPresentImage = (value: string | undefined, defaultImage: string): boolean => {
  const normalized = normalize(value);
  return normalized.length > 0 && normalized !== defaultImage;
};

const hasLogo = (truck: TruckCelebrationSnapshot): boolean =>
  isPresentImage(truck.logo, DEFAULT_TRUCK_LOGO_IMAGE);

const hasHeroImage = (truck: TruckCelebrationSnapshot): boolean =>
  isPresentImage(truck.hero_image, DEFAULT_TRUCK_HERO_IMAGE);

const isCustomerVisible = (truck: TruckCelebrationSnapshot): boolean =>
  normalize(truck.name).length > 0 &&
  hasLogo(truck) &&
  hasHeroImage(truck) &&
  truck.archived !== true &&
  !truck.archivedAt &&
  truck.is_test !== true;

const isTruckScoped = <T extends { truck_id?: string | number | null }>(
  item: T,
  truckId: string
): boolean => item.truck_id?.toString() === truckId;

const isReviewForTruck = (review: Review, truckId: string): boolean =>
  review.truckId?.toString() === truckId;

const isArchivedOrTest = (truck: TruckCelebrationSnapshot): boolean =>
  truck.archived === true || !!truck.archivedAt || truck.is_test === true;

const getScopedCount = <T extends { truck_id?: string | number | null }>(
  truck: TruckCelebrationSnapshot,
  items: T[] | undefined,
  explicitCount: number | undefined
): number | null => {
  if (typeof explicitCount === 'number' && Number.isFinite(explicitCount)) {
    return Math.max(0, explicitCount);
  }

  if (!Array.isArray(items)) return null;

  const truckId = truck.id?.toString();
  if (!truckId) return items.length;

  return items.filter(item => isTruckScoped(item, truckId)).length;
};

const getReviewCount = (truck: TruckCelebrationSnapshot): number | null => {
  if (typeof truck.reviewCount === 'number' && Number.isFinite(truck.reviewCount)) {
    return Math.max(0, truck.reviewCount);
  }

  if (!Array.isArray(truck.reviews)) return null;

  const truckId = truck.id?.toString();
  if (!truckId) return truck.reviews.length;

  return truck.reviews.filter(review => isReviewForTruck(review, truckId)).length;
};

const getFollowerCount = (truck: TruckCelebrationSnapshot): number | null => {
  if (typeof truck.followerCount === 'number' && Number.isFinite(truck.followerCount)) {
    return Math.max(0, truck.followerCount);
  }

  if (typeof truck.favoritesCount === 'number' && Number.isFinite(truck.favoritesCount)) {
    return Math.max(0, truck.favoritesCount);
  }

  if (typeof truck.analytics?.favorites === 'number' && Number.isFinite(truck.analytics.favorites)) {
    return Math.max(0, truck.analytics.favorites);
  }

  if (Array.isArray(truck.followers)) {
    return truck.followers.length;
  }

  return null;
};

const crossedFromZero = (previousCount: number | null, currentCount: number | null): boolean =>
  previousCount !== null && currentCount !== null && previousCount === 0 && currentCount > 0;

export function getTruckCelebration(
  previousTruck: TruckCelebrationSnapshot,
  currentTruck: TruckCelebrationSnapshot
): TruckCelebration | null {
  if (isArchivedOrTest(currentTruck)) {
    return null;
  }

  if (!isCustomerVisible(previousTruck) && isCustomerVisible(currentTruck)) {
    return {
      title: 'Your truck is visible',
      message: 'Big step. Customers can now discover your truck on TruckTap.',
      type: 'profile_became_visible',
    };
  }

  if (!hasLogo(previousTruck) && hasLogo(currentTruck)) {
    return {
      title: 'Logo added',
      message: 'Nice work. Your truck now has a logo customers can recognize.',
      type: 'logo_added',
    };
  }

  if (!hasHeroImage(previousTruck) && hasHeroImage(currentTruck)) {
    return {
      title: 'Hero image added',
      message: 'Looking sharp. Your profile now has a strong first impression.',
      type: 'hero_image_added',
    };
  }

  if (crossedFromZero(
    getScopedCount(previousTruck, previousTruck.upcomingStops, previousTruck.upcomingStopCount),
    getScopedCount(currentTruck, currentTruck.upcomingStops, currentTruck.upcomingStopCount)
  )) {
    return {
      title: 'First stop scheduled',
      message: 'Great planning. Customers can now see where you will be next.',
      type: 'first_upcoming_stop_added',
    };
  }

  if (crossedFromZero(
    getScopedCount(previousTruck, previousTruck.announcements, previousTruck.announcementCount),
    getScopedCount(currentTruck, currentTruck.announcements, currentTruck.announcementCount)
  )) {
    return {
      title: 'First announcement posted',
      message: 'Nice update. You gave customers a fresh reason to check in.',
      type: 'first_announcement_added',
    };
  }

  if (crossedFromZero(
    getScopedCount(previousTruck, previousTruck.menuItems, previousTruck.menuItemCount),
    getScopedCount(currentTruck, currentTruck.menuItems, currentTruck.menuItemCount)
  )) {
    return {
      title: 'First menu item added',
      message: 'Good move. Customers can now see what you are serving.',
      type: 'first_menu_item_added',
    };
  }

  if (crossedFromZero(
    Array.isArray(previousTruck.images) ? previousTruck.images.length : null,
    Array.isArray(currentTruck.images) ? currentTruck.images.length : null
  )) {
    return {
      title: 'First gallery photo added',
      message: 'That helps customers picture the experience before they visit.',
      type: 'first_gallery_photo_added',
    };
  }

  if (crossedFromZero(getFollowerCount(previousTruck), getFollowerCount(currentTruck))) {
    return {
      title: 'First follower',
      message: 'Someone saved your truck. Your audience is starting to grow.',
      type: 'first_follower_added',
    };
  }

  if (crossedFromZero(getReviewCount(previousTruck), getReviewCount(currentTruck))) {
    return {
      title: 'First review',
      message: 'You earned your first review. That is a real trust signal.',
      type: 'first_review_added',
    };
  }

  return null;
}
