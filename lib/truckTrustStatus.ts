import type { TruckActivityStatus } from '@/contexts/AppContext';
import type { FoodTruck } from '@/types';

export type TruckTrustState = 'verified_active' | 'recently_updated' | 'outdated' | 'hidden';

export type TruckTrustStatus = {
  state: TruckTrustState;
  label: string;
  tone: 'success' | 'warning' | 'neutral';
};

type TruckTrustStatusInput = {
  truck: FoodTruck | null | undefined;
  profileVisible: boolean;
  activityStatus: TruckActivityStatus;
};

export function getTruckTrustStatus({
  truck,
  profileVisible,
  activityStatus,
}: TruckTrustStatusInput): TruckTrustStatus {
  if (!truck || !profileVisible) {
    return {
      state: 'hidden',
      label: 'Hidden',
      tone: 'neutral',
    };
  }

  const updatedTodayOrYesterday =
    activityStatus.daysSinceActivity !== null && activityStatus.daysSinceActivity <= 1;

  if (activityStatus.activeOnTruckTap && updatedTodayOrYesterday) {
    return {
      state: 'verified_active',
      label: '🟢 Current Information',
      tone: 'success',
    };
  }

  if (activityStatus.activeOnTruckTap) {
    return {
      state: 'recently_updated',
      label: '🟡 Recently Updated',
      tone: 'warning',
    };
  }

  return {
    state: 'outdated',
    label: '⚪ Older Information',
    tone: 'neutral',
  };
}
