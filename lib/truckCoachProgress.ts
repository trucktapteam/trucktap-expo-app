import AsyncStorage from '@react-native-async-storage/async-storage';
import { TruckCommandCenter } from '@/lib/truckCommandCenter';
import { Announcement, FoodTruck, Review, UpcomingStop } from '@/types';

export type TruckCoachMilestoneId =
  | 'added_truck_name'
  | 'uploaded_logo'
  | 'uploaded_hero_image'
  | 'became_visible'
  | 'went_live'
  | 'added_first_upcoming_stop'
  | 'posted_first_announcement'
  | 'received_first_review'
  | 'replied_to_first_review';

type TruckCoachProgressInput = {
  truck: FoodTruck;
  commandCenter: TruckCommandCenter;
  upcomingStops?: UpcomingStop[];
  announcements?: Announcement[];
  reviews?: Review[];
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
};

const milestoneOrder: TruckCoachMilestoneId[] = [
  'added_truck_name',
  'uploaded_logo',
  'uploaded_hero_image',
  'became_visible',
  'went_live',
  'added_first_upcoming_stop',
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

export const getCompletedTruckCoachMilestones = ({
  truck,
  commandCenter,
  upcomingStops,
  announcements,
  reviews,
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
    commandCenter.profileCompleteness.complete &&
    truck.archived !== true &&
    !truck.archivedAt &&
    truck.is_test !== true
  ) {
    completed.add('became_visible');
  }

  if (truck.open_now === true) {
    completed.add('went_live');
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
