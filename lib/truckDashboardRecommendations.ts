import { getTodaysMission } from '@/lib/truckMission';
import type { TruckMission } from '@/lib/truckMission';
import type { TruckCommandCenter } from '@/lib/truckCommandCenter';
import type { TruckOpportunity } from '@/lib/truckOpportunities';

const BIGGEST_OPPORTUNITIES_LIMIT = 5;

export type TruckDashboardRecommendations = {
  mission: TruckMission;
  /** Top opportunities for the Biggest Opportunities card - excludes whichever one is already shown as the Mission, so nothing is duplicated. */
  opportunities: TruckOpportunity[];
};

export function coordinateTruckDashboardRecommendations(
  commandCenter: TruckCommandCenter,
  opportunities: TruckOpportunity[],
  truckId?: string | number | null,
  missionOverride?: TruckMission | null
): TruckDashboardRecommendations {
  const mission = missionOverride ?? getTodaysMission(commandCenter, opportunities, truckId);

  const eligibleOpportunities = (
    mission.kind === 'opportunity' && mission.sourceOpportunityId
      ? opportunities.filter(opportunity => opportunity.id !== mission.sourceOpportunityId)
      : [...opportunities]
  );
  const displayOpportunities = eligibleOpportunities
    .sort((a, b) => Number(b.action === 'goLive') - Number(a.action === 'goLive'))
    .slice(0, BIGGEST_OPPORTUNITIES_LIMIT);

  return { mission, opportunities: displayOpportunities };
}
