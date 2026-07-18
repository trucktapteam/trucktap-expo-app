import type { FoodTruck } from '../types';
import { getPublicReadyStatus } from './truckPublicReady';
import type {
  PublicReadyEvaluationOptions,
  PublicReadyRequirement,
} from './truckPublicReady';

export type TruckVisibilitySetupRequirement = PublicReadyRequirement;
export type TruckVisibilityRecommendedItem = 'bio' | 'service_area';

export type TruckVisibilitySetupStatus = {
  /** True once every Public Ready requirement is satisfied (this is what unlocks customer visibility). */
  complete: boolean;
  /** Required-and-missing Public Ready items, in canonical order. */
  missing: TruckVisibilitySetupRequirement[];
  /** Non-blocking coaching items worth prompting for even though they don't gate visibility. */
  recommended: TruckVisibilityRecommendedItem[];
  isLegacy: boolean;
};

const normalize = (value?: string | null): string => value?.trim() ?? '';

/**
 * Consumes the same canonical Public Ready helper as lib/truckProfileCompleteness.ts
 * so the owner setup wizard and the customer-visibility gate can never drift apart.
 */
export function getTruckVisibilitySetupStatus(
  truck: FoodTruck,
  publicReadyOptions?: PublicReadyEvaluationOptions,
): TruckVisibilitySetupStatus {
  const publicReady = getPublicReadyStatus(truck, publicReadyOptions);
  const bio = normalize(truck.bio);
  const serviceArea = normalize(truck.service_area);

  const recommended: TruckVisibilityRecommendedItem[] = [];
  if (publicReady.isLegacy && !publicReady.bioRequired && bio.length === 0) {
    recommended.push('bio');
  }
  if (serviceArea.length === 0) recommended.push('service_area');

  return {
    complete: publicReady.complete,
    missing: publicReady.missing,
    recommended,
    isLegacy: publicReady.isLegacy,
  };
}

export function isTruckVisibilitySetupComplete(
  truck: FoodTruck,
  publicReadyOptions?: PublicReadyEvaluationOptions,
): boolean {
  return getTruckVisibilitySetupStatus(truck, publicReadyOptions).complete;
}
