import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TruckCommandCenter } from '@/lib/truckCommandCenter';
import { getMenuBoardImageFromMenuImages } from '@/lib/truckMenu';
import type { Announcement, FoodTruck, MenuItem, Review, UpcomingStop } from '@/types';

export type TruckCoachMilestoneId =
  | 'added_truck_name'
  | 'uploaded_logo'
  | 'uploaded_hero_image'
  | 'became_visible'
  | 'went_live'
  | 'added_first_upcoming_stop'
  | 'posted_first_announcement'
  | 'received_first_review'
  | 'replied_to_first_review'
  | 'added_menu'
  | 'shared_qr_code';

type TruckCoachProgressInput = {
  truck: FoodTruck;
  commandCenter: TruckCommandCenter;
  upcomingStops?: UpcomingStop[];
  announcements?: Announcement[];
  reviews?: Review[];
  menuItems?: MenuItem[];
  qrShared?: boolean;
};

type TruckCoachProgressMemory = {
  initialized: boolean;
  celebrated: TruckCoachMilestoneId[];
};

export type TruckCoachMilestoneCelebration = {
  id: TruckCoachMilestoneId;
  message: string;
};

const STORAGE_PREFIX = 'truckCoachProgress:v1';

const milestoneCelebrations: Record<TruckCoachMilestoneId, string> = {
  added_truck_name: 'Nice work. Your truck name is set.',
  uploaded_logo: 'Great move. Your logo is uploaded.',
  uploaded_hero_image: 'Looking sharp. Your hero image is uploaded.',
  became_visible: 'Big step. Customers can now discover your truck.',
  went_live: "You're LIVE. Customers nearby can find you now.",
  added_first_upcoming_stop: 'Nice planning. Your first upcoming stop is on the schedule.',
  posted_first_announcement: 'Good update. Your first announcement is posted.',
  received_first_review: 'You got your first review. That is a real trust signal.',
  replied_to_first_review: 'Great follow-through. You replied to your first review.',
  added_menu: 'Nice work! Customers can now see your menu.',
  shared_qr_code: "You've put your QR code to work - every scan can bring a customer back.",
};

const milestoneOrder: TruckCoachMilestoneId[] = [
  'added_truck_name',
  'uploaded_logo',
  'uploaded_hero_image',
  'became_visible',
  'added_menu',
  'went_live',
  'added_first_upcoming_stop',
  'shared_qr_code',
  'posted_first_announcement',
  'received_first_review',
  'replied_to_first_review',
];

const getStorageKey = (truckId: string): string => `${STORAGE_PREFIX}:${truckId}`;

const parseMemory = (value: string | null): TruckCoachProgressMemory => {
  if (!value) {
    return { initialized: false, celebrated: [] };
  }

  try {
    const parsed = JSON.parse(value) as Partial<TruckCoachProgressMemory>;
    return {
      initialized: parsed.initialized === true,
      celebrated: Array.isArray(parsed.celebrated)
        ? parsed.celebrated.filter((id): id is TruckCoachMilestoneId =>
          milestoneOrder.includes(id as TruckCoachMilestoneId)
        )
        : [],
    };
  } catch {
    return { initialized: false, celebrated: [] };
  }
};

const hasTruckScopedItem = <T extends { truck_id?: string }>(
  items: T[] | undefined,
  truckId: string
): boolean => (items ?? []).some(item => item.truck_id?.toString() === truckId);

const hasTruckReview = (reviews: Review[] | undefined, truckId: string): boolean =>
  (reviews ?? []).some(review => review.truckId?.toString() === truckId);

const hasTruckReviewReply = (reviews: Review[] | undefined, truckId: string): boolean =>
  (reviews ?? []).some(review => review.truckId?.toString() === truckId && !!review.ownerReply);

const hasTruckMenuContent = (
  truck: FoodTruck,
  menuItems: MenuItem[] | undefined,
  truckId: string
): boolean => {
  const truckMenuItems = (menuItems ?? []).filter(item => item.truck_id?.toString() === truckId);
  return truckMenuItems.length > 0 || !!getMenuBoardImageFromMenuImages(truck.menu_images);
};

export const getCompletedTruckCoachMilestones = ({
  truck,
  commandCenter,
  upcomingStops,
  announcements,
  reviews,
  menuItems,
  qrShared,
}: TruckCoachProgressInput): TruckCoachMilestoneId[] => {
  const truckId = truck.id?.toString();
  const completed = new Set<TruckCoachMilestoneId>();

  if (!commandCenter.profileCompleteness.missing.includes('name')) {
    completed.add('added_truck_name');
  }

  if (!commandCenter.profileCompleteness.missing.includes('logo')) {
    completed.add('uploaded_logo');
  }

  if (!commandCenter.profileCompleteness.missing.includes('hero')) {
    completed.add('uploaded_hero_image');
  }

  if (
    commandCenter.publicReady.complete &&
    truck.archived !== true &&
    !truck.archivedAt &&
    truck.is_test !== true
  ) {
    completed.add('became_visible');
  }

  if (truckId && hasTruckMenuContent(truck, menuItems, truckId)) {
    completed.add('added_menu');
  }

  if (truck.open_now === true) {
    completed.add('went_live');
  }

  if (qrShared === true) {
    completed.add('shared_qr_code');
  }

  if (truckId && hasTruckScopedItem(upcomingStops, truckId)) {
    completed.add('added_first_upcoming_stop');
  }

  if (truckId && hasTruckScopedItem(announcements, truckId)) {
    completed.add('posted_first_announcement');
  }

  if (truckId && hasTruckReview(reviews, truckId)) {
    completed.add('received_first_review');
  }

  if (truckId && hasTruckReviewReply(reviews, truckId)) {
    completed.add('replied_to_first_review');
  }

  return milestoneOrder.filter(id => completed.has(id));
};

export async function getTruckCoachProgressCelebration(
  input: TruckCoachProgressInput
): Promise<TruckCoachMilestoneCelebration | null> {
  const truckId = input.truck.id?.toString();
  if (!truckId) return null;

  const completed = getCompletedTruckCoachMilestones(input);
  const key = getStorageKey(truckId);
  const memory = parseMemory(await AsyncStorage.getItem(key));

  if (!memory.initialized) {
    await AsyncStorage.setItem(key, JSON.stringify({ initialized: true, celebrated: completed }));
    return null;
  }

  const celebrated = new Set(memory.celebrated);
  const nextMilestone = completed.find(id => !celebrated.has(id));

  if (!nextMilestone) return null;

  const nextCelebrated = milestoneOrder.filter(id => celebrated.has(id) || id === nextMilestone);
  await AsyncStorage.setItem(key, JSON.stringify({ initialized: true, celebrated: nextCelebrated }));

  return {
    id: nextMilestone,
    message: milestoneCelebrations[nextMilestone],
  };
}
