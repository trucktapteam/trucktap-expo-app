import { getTruckCoachMessage, TruckCoachMessage } from '@/lib/truckCoach';
import { getRoadTipCategory, RoadTip, selectDailyRoadTip } from '@/lib/truckCoach/roadTips';
import { TruckCommandCenter, TruckNextBestAction } from '@/lib/truckCommandCenter';
import { TruckOpportunity, TruckOpportunityAction } from '@/lib/truckOpportunities';

export type TruckDashboardRecommendations = {
  nextActionMessage: string;
  coach: TruckCoachMessage;
  roadTip: RoadTip;
  opportunities: TruckOpportunity[];
};

const opportunityActionByNextAction: Record<TruckNextBestAction, TruckOpportunityAction | null> = {
  'Add Truck Name': null,
  'Upload Logo': null,
  'Upload Hero Image': null,
  'Add Bio': null,
  'Add Service Area': null,
  'Add Menu': 'menu',
  'Add Gallery Photos': 'gallery',
  'Add Operating Hours': null,
  'Go LIVE': 'goLive',
  'Add Upcoming Stop': 'schedule',
  'Check Messages': null,
  'Add Announcement': 'announcement',
  'Respond to Reviews': 'reviews',
  "Great Job — You're Ready": null,
  'No action available': null,
};

export function coordinateTruckDashboardRecommendations(
  commandCenter: TruckCommandCenter,
  opportunities: TruckOpportunity[],
  truckId?: string | number | null
): TruckDashboardRecommendations {
  const actionCoach = getTruckCoachMessage(commandCenter);
  const roadTip = selectDailyRoadTip(truckId, getRoadTipCategory(commandCenter.nextAction));
  const activeOpportunityAction = opportunityActionByNextAction[commandCenter.nextAction];
  const seenActions = new Set<TruckOpportunityAction>();

  const secondaryOpportunities = opportunities.filter(opportunity => {
    if (activeOpportunityAction && opportunity.action === activeOpportunityAction) return false;
    if (opportunity.action === 'none') return true;
    if (seenActions.has(opportunity.action)) return false;

    seenActions.add(opportunity.action);
    return true;
  });

  return {
    nextActionMessage: actionCoach.message,
    coach: {
      ...actionCoach,
      headline: 'Road Tip',
      message: roadTip.summary,
      encouragement: roadTip.detail,
      estimatedTime: '',
    },
    roadTip,
    opportunities: secondaryOpportunities,
  };
}
