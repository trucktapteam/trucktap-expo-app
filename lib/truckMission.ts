import type { TruckCommandCenter } from '@/lib/truckCommandCenter';
import type { PublicReadyRequirement } from '@/lib/truckPublicReady';
import { selectDailyRoadTip } from '@/lib/truckCoach/roadTips';
import type { TruckOpportunity, TruckOpportunityAction } from '@/lib/truckOpportunities';

export type TruckMissionKind = 'blocker' | 'urgent' | 'opportunity' | 'completed' | 'steady';

export type TruckMission = {
  kind: TruckMissionKind;
  title: string;
  why: string;
  ctaLabel: string;
  action: TruckOpportunityAction;
  tips?: string[];
  /** Set when kind === 'opportunity' - lets the Biggest Opportunities list exclude the card already shown as the Mission. */
  sourceOpportunityId?: string;
};

// Visibility blockers come before any growth advice - a truck customers
// can't find or trust yet needs this fixed first, same gating order as the
// old getNextBestAction waterfall (name -> logo -> hero -> bio-if-required).
const blockerMissions: Record<PublicReadyRequirement, TruckMission> = {
  name: {
    kind: 'blocker',
    title: 'Add Your Truck Name',
    why: 'Customers can’t find, follow, or recommend a truck they can’t identify. This is the first thing that has to be in place.',
    ctaLabel: 'Add Truck Name',
    action: 'profile',
  },
  logo: {
    kind: 'blocker',
    title: 'Upload Your Logo',
    why: 'A recognizable logo helps customers spot you in search results and remember you after they visit.',
    ctaLabel: 'Upload Logo',
    action: 'profile',
  },
  hero: {
    kind: 'blocker',
    title: 'Upload a Hero Image',
    why: 'Your hero image is the first impression customers get of your truck - a clear, current photo builds instant trust.',
    ctaLabel: 'Upload Hero Image',
    action: 'profile',
  },
  bio: {
    kind: 'blocker',
    title: 'Add a Short Bio',
    why: 'A few sentences about your food and story help customers decide you’re worth the trip before they ever see your menu.',
    ctaLabel: 'Add Bio',
    action: 'profile',
  },
};

const urgentMissionStartsSoon: TruckMission = {
  kind: 'urgent',
  title: 'Go LIVE Before Your Event Begins',
  why: 'Customers will be looking for your truck soon. Going LIVE now means you’re visible the moment they start searching.',
  ctaLabel: 'Go LIVE',
  action: 'goLive',
};

const urgentMissionStarted: TruckMission = {
  kind: 'urgent',
  title: 'Go LIVE Now',
  why: 'Your scheduled stop has started. Until you go LIVE, customers may think you’re closed.',
  ctaLabel: 'Go LIVE',
  action: 'goLive',
};

export const getSteadyStateMission = (truckId: string | number | null | undefined): TruckMission => ({
  kind: 'steady',
  title: 'You’re Ready for Customers',
  why: selectDailyRoadTip(truckId, 'activity').detail,
  ctaLabel: '',
  action: 'none',
});

const missionCtaLabels: Partial<Record<TruckOpportunityAction, string>> = {
  qrCenter: 'Print QR Code',
  schedule: 'Schedule a Stop',
  goLive: 'Go LIVE',
  announcement: 'Share Update',
  checkIns: 'View Check-Ins',
  menu: 'Edit Menu',
  gallery: 'Add Photos',
  reviews: 'Reply to Reviews',
  profile: 'Edit Profile',
};

const getMissionCtaLabel = (action: TruckOpportunityAction): string =>
  missionCtaLabels[action] ?? 'View';

const publicReadyOrder: PublicReadyRequirement[] = ['name', 'logo', 'hero', 'bio'];

export const getUrgentMission = (commandCenter: TruckCommandCenter): TruckMission | null => {
  for (const requirement of publicReadyOrder) {
    if (commandCenter.publicReady.missing.includes(requirement)) {
      return blockerMissions[requirement];
    }
  }

  if (commandCenter.eventReadiness === 'started') return urgentMissionStarted;
  if (commandCenter.eventReadiness === 'starts_soon') return urgentMissionStartsSoon;
  return null;
};

export const getOpportunityMission = (opportunity: TruckOpportunity): TruckMission => ({
  kind: 'opportunity',
  title: opportunity.title,
  why: opportunity.why,
  ctaLabel: getMissionCtaLabel(opportunity.action),
  action: opportunity.action,
  tips: opportunity.tips,
  sourceOpportunityId: opportunity.id,
});

export const getCompletedDailyMission = (title: string): TruckMission => ({
  kind: 'completed',
  title: "Today's Mission Complete",
  why: `Nice work - you completed "${title}". Your next mission arrives tomorrow.`,
  ctaLabel: '',
  action: 'none',
});

/**
 * Today's Mission: exactly one recommendation. Order of precedence:
 * 1. Visibility blockers (customers can't find the truck at all yet)
 * 2. Time-sensitive Go LIVE (a scheduled stop starts soon or has started)
 * 3. The #1-ranked Biggest Opportunity (business-impact ranked, not completeness)
 * 4. Steady state - nothing urgent, nothing applicable
 */
export function getTodaysMission(
  commandCenter: TruckCommandCenter,
  opportunities: TruckOpportunity[],
  truckId?: string | number | null
): TruckMission {
  const urgentMission = getUrgentMission(commandCenter);
  if (urgentMission) return urgentMission;

  const topOpportunity = opportunities[0];
  if (topOpportunity) return getOpportunityMission(topOpportunity);

  return getSteadyStateMission(truckId);
}
