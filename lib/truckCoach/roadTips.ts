import { TruckNextBestAction } from '@/lib/truckCommandCenter';

export type RoadTipCategory =
  | 'schedule'
  | 'menu'
  | 'hero_image'
  | 'logo'
  | 'bio'
  | 'gallery'
  | 'announcements'
  | 'reviews'
  | 'public_ready'
  | 'activity'
  | 'customer_engagement';

export type RoadTip = {
  id: string;
  category: RoadTipCategory;
  summary: string;
  detail: string;
};

export const ROAD_TIPS_BY_CATEGORY: Record<RoadTipCategory, RoadTip[]> = {
  schedule: [
    {
      id: 'schedule-plan-ahead', category: 'schedule',
      summary: 'Future stops help customers plan ahead.',
      detail: 'Keeping one or two future stops scheduled gives followers time to plan a visit and keeps your profile useful between service days.',
    },
    {
      id: 'schedule-stay-visible', category: 'schedule',
      summary: 'A current schedule makes your truck feel active.',
      detail: 'Even when you are not LIVE, upcoming stops reassure customers that your truck is active and give them a clear reason to return.',
    },
    {
      id: 'schedule-clear-details', category: 'schedule',
      summary: 'Clear stop details reduce last-minute questions.',
      detail: 'Accurate times, locations, and event names help customers arrive prepared and reduce uncertainty before service begins.',
    },
    {
      id: 'schedule-consistent-rhythm', category: 'schedule',
      summary: 'A consistent schedule builds a familiar rhythm.',
      detail: 'When customers can recognize your usual days or areas, it becomes easier for them to make your truck part of their routine.',
    },
    {
      id: 'schedule-review-regularly', category: 'schedule',
      summary: 'A quick schedule check keeps expectations accurate.',
      detail: 'Reviewing upcoming stops regularly helps catch outdated times or locations before customers rely on them.',
    },
  ],
  menu: [
    {
      id: 'menu-confidence', category: 'menu',
      summary: 'Menus help customers choose with confidence.',
      detail: 'Clear item names, descriptions, and prices let customers understand what you serve before they make the trip.',
    },
    {
      id: 'menu-faster-orders', category: 'menu',
      summary: 'A clear menu can make ordering feel easier.',
      detail: 'Customers who browse ahead often arrive with a better idea of what they want, which can make the ordering experience smoother.',
    },
    {
      id: 'menu-signature-items', category: 'menu',
      summary: 'Signature items make a menu memorable.',
      detail: 'Descriptive names and strong photos help standout dishes become the items customers remember and recommend.',
    },
    {
      id: 'menu-current-details', category: 'menu',
      summary: 'Current menu details prevent disappointment.',
      detail: 'Keeping availability, descriptions, and prices accurate helps customer expectations match the experience at the window.',
    },
    {
      id: 'menu-board-or-items', category: 'menu',
      summary: 'A menu board and item list can work together.',
      detail: 'The full board gives customers the big picture, while individual items make featured dishes easier to browse.',
    },
  ],
  hero_image: [
    {
      id: 'hero-first-impression', category: 'hero_image',
      summary: 'Your hero image creates the first impression.',
      detail: 'A bright, current cover photo helps customers recognize your truck quickly and understand the experience you offer.',
    },
    {
      id: 'hero-clear-subject', category: 'hero_image',
      summary: 'Simple hero photos are easier to recognize.',
      detail: 'An uncluttered image with one clear subject usually reads better at a glance than a photo filled with small details.',
    },
    {
      id: 'hero-current-look', category: 'hero_image',
      summary: 'A current photo builds confidence.',
      detail: 'Using an image that matches your truck today reassures customers that they have found the right business.',
    },
    {
      id: 'hero-wide-crop', category: 'hero_image',
      summary: 'Wide images work naturally as profile covers.',
      detail: 'A landscape photo with the main subject near the center stays recognizable across different screen sizes and crops.',
    },
  ],
  logo: [
    {
      id: 'logo-recognition', category: 'logo',
      summary: 'A recognizable logo helps customers spot you.',
      detail: 'Consistent branding across your truck, profile, and social channels makes your business easier to remember.',
    },
    {
      id: 'logo-simple-shape', category: 'logo',
      summary: 'Simple logos stay clear at small sizes.',
      detail: 'Bold shapes and readable lettering remain recognizable in map cards, lists, and other compact profile placements.',
    },
    {
      id: 'logo-current-brand', category: 'logo',
      summary: 'Current branding prevents customer confusion.',
      detail: 'If your truck signage changes, updating the profile logo helps customers connect the app listing to the truck they see in person.',
    },
  ],
  bio: [
    {
      id: 'bio-story', category: 'bio',
      summary: 'A short story makes your truck memorable.',
      detail: 'A few details about your food, background, or community give customers something meaningful to remember and share.',
    },
    {
      id: 'bio-specialty', category: 'bio',
      summary: 'Your bio can explain what makes you different.',
      detail: 'Highlighting a specialty, inspiration, or approach helps customers quickly understand what sets your truck apart.',
    },
    {
      id: 'bio-human-voice', category: 'bio',
      summary: 'A natural voice feels more welcoming.',
      detail: 'Writing the way you would describe the truck to a customer at the window can make the profile feel personal and authentic.',
    },
    {
      id: 'bio-keep-focused', category: 'bio',
      summary: 'Focused bios are easier to remember.',
      detail: 'A concise introduction with one or two memorable details often communicates more clearly than a long list of facts.',
    },
  ],
  gallery: [
    {
      id: 'gallery-build-trust', category: 'gallery',
      summary: 'Gallery photos help customers know what to expect.',
      detail: 'A mix of food, truck, and service photos makes the experience feel real before a customer arrives.',
    },
    {
      id: 'gallery-variety', category: 'gallery',
      summary: 'Photo variety tells a fuller story.',
      detail: 'Combining close-up dishes, the service window, and the full truck gives customers several useful views of your business.',
    },
    {
      id: 'gallery-lighting', category: 'gallery',
      summary: 'Good lighting makes food easier to appreciate.',
      detail: 'Natural or even lighting preserves color and detail, helping menu favorites look inviting without heavy editing.',
    },
    {
      id: 'gallery-refresh', category: 'gallery',
      summary: 'Fresh photos keep a profile feeling active.',
      detail: 'Occasionally adding current dishes, events, or truck updates reassures customers that the profile reflects today’s experience.',
    },
    {
      id: 'gallery-authentic', category: 'gallery',
      summary: 'Authentic photos can be more useful than perfect ones.',
      detail: 'Clear, honest images of the food and truck help customers form expectations they can trust when they visit.',
    },
  ],
  announcements: [
    {
      id: 'announcement-stay-connected', category: 'announcements',
      summary: 'Announcements keep followers connected.',
      detail: 'Short updates about specials, changes, or milestones give regulars a reason to check back between scheduled stops.',
    },
    {
      id: 'announcement-timely', category: 'announcements',
      summary: 'Timely updates are the most useful updates.',
      detail: 'Sharing information while it can still help customers keeps announcements relevant and prevents stale expectations.',
    },
    {
      id: 'announcement-one-message', category: 'announcements',
      summary: 'One clear message is easy to understand.',
      detail: 'A focused announcement with the essential detail first helps followers understand the update quickly.',
    },
    {
      id: 'announcement-personality', category: 'announcements',
      summary: 'Updates are a place to show personality.',
      detail: 'A warm, natural voice can make specials and milestones feel like news from a familiar local business.',
    },
    {
      id: 'announcement-between-stops', category: 'announcements',
      summary: 'Quiet days can still keep followers engaged.',
      detail: 'Behind-the-scenes notes, menu previews, or next-week reminders can keep the relationship active between service days.',
    },
  ],
  reviews: [
    {
      id: 'reviews-show-listening', category: 'reviews',
      summary: 'Thoughtful replies show that you listen.',
      detail: 'A respectful response tells both the reviewer and future customers that feedback matters to your business.',
    },
    {
      id: 'reviews-specific', category: 'reviews',
      summary: 'Specific replies feel more genuine.',
      detail: 'Referring naturally to the customer’s experience makes a response more personal than using the same generic message every time.',
    },
    {
      id: 'reviews-calm-tone', category: 'reviews',
      summary: 'A calm reply protects customer confidence.',
      detail: 'When feedback is difficult, a clear and courteous response demonstrates professionalism to everyone reading later.',
    },
    {
      id: 'reviews-gratitude', category: 'reviews',
      summary: 'Gratitude strengthens positive moments.',
      detail: 'Thanking customers for useful details or kind feedback reinforces the relationship without needing a long response.',
    },
    {
      id: 'reviews-learn', category: 'reviews',
      summary: 'Review patterns can reveal useful lessons.',
      detail: 'Repeated comments about an item or experience may highlight what customers value most or where expectations need clarification.',
    },
  ],
  public_ready: [
    {
      id: 'public-ready-complete-story', category: 'public_ready',
      summary: 'A complete profile tells a more confident story.',
      detail: 'Core identity and profile details work together so customers can recognize the truck and understand what it offers.',
    },
    {
      id: 'public-ready-foundation', category: 'public_ready',
      summary: 'Public Ready details create a strong foundation.',
      detail: 'Once the essentials are complete, schedules, menus, photos, and updates have a reliable profile to build on.',
    },
    {
      id: 'public-ready-accuracy', category: 'public_ready',
      summary: 'Accurate basics prevent customer confusion.',
      detail: 'Current names, images, and descriptions help customers connect the profile they browse with the truck they visit.',
    },
    {
      id: 'public-ready-progress', category: 'public_ready',
      summary: 'Each completed profile detail adds clarity.',
      detail: 'Small improvements combine into a profile that is easier to recognize, understand, and trust.',
    },
  ],
  activity: [
    {
      id: 'activity-current-status', category: 'activity',
      summary: 'Current activity builds customer confidence.',
      detail: 'Accurate LIVE status, locations, and schedules reassure customers that the information they see is dependable.',
    },
    {
      id: 'activity-steady-presence', category: 'activity',
      summary: 'A steady presence keeps your truck familiar.',
      detail: 'Regular service updates and future stops help customers remember your truck even when they are not visiting that day.',
    },
    {
      id: 'activity-small-updates', category: 'activity',
      summary: 'Small updates can maintain strong momentum.',
      detail: 'Keeping one detail current at a time is often enough to make the whole profile feel cared for and dependable.',
    },
    {
      id: 'activity-celebrate-progress', category: 'activity',
      summary: 'Consistent progress is worth celebrating.',
      detail: 'A complete profile and current operating details create a strong base you can maintain without changing everything at once.',
    },
  ],
  customer_engagement: [
    {
      id: 'engagement-clear-expectations', category: 'customer_engagement',
      summary: 'Clear expectations make visits easier.',
      detail: 'Useful details about where, when, and what you serve help customers feel prepared before they head your way.',
    },
    {
      id: 'engagement-return-reasons', category: 'customer_engagement',
      summary: 'Fresh information gives customers a reason to return.',
      detail: 'Schedules, menu updates, photos, and announcements each offer a natural reason for followers to check the profile again.',
    },
    {
      id: 'engagement-consistency', category: 'customer_engagement',
      summary: 'Consistency turns information into trust.',
      detail: 'When profile details match the real service experience, customers learn that TruckTap is a dependable way to follow your truck.',
    },
    {
      id: 'engagement-familiarity', category: 'customer_engagement',
      summary: 'Familiar details help customers remember you.',
      detail: 'A consistent name, visual identity, story, and service area make it easier for customers to recognize your truck later.',
    },
  ],
};

const categoryByNextAction: Record<TruckNextBestAction, RoadTipCategory> = {
  'Add Truck Name': 'public_ready',
  'Upload Logo': 'logo',
  'Upload Hero Image': 'hero_image',
  'Add Bio': 'bio',
  'Add Service Area': 'customer_engagement',
  'Add Menu': 'menu',
  'Add Gallery Photos': 'gallery',
  'Add Operating Hours': 'schedule',
  'Go LIVE': 'activity',
  'Add Upcoming Stop': 'schedule',
  'Check Messages': 'customer_engagement',
  'Add Announcement': 'announcements',
  'Respond to Reviews': 'reviews',
  "Great Job — You're Ready": 'activity',
  'No action available': 'customer_engagement',
};

const hashStableString = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const getLocalDayNumber = (date: Date): number =>
  Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

export const getRoadTipCategory = (nextAction: TruckNextBestAction): RoadTipCategory =>
  categoryByNextAction[nextAction];

export function selectDailyRoadTip(
  truckId: string | number | null | undefined,
  category: RoadTipCategory,
  date = new Date()
): RoadTip {
  const tips = ROAD_TIPS_BY_CATEGORY[category];
  const stableOffset = hashStableString(`${truckId ?? 'unknown-truck'}:${category}`);
  const tipIndex = (stableOffset + getLocalDayNumber(date)) % tips.length;

  return tips[tipIndex];
}
