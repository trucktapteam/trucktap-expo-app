import {
  DEFAULT_TRUCK_HERO_IMAGE,
  DEFAULT_TRUCK_LOGO_IMAGE,
} from '../constants/truckDefaults';
import type { FoodTruck, User } from '../types';
import { isTruckPublicReady } from './truckPublicReady';
import type { PublicReadyEvaluationOptions } from './truckPublicReady';

export type TruckProfileRequirement = 'name' | 'logo' | 'hero' | 'service_area';

export type TruckProfileCompleteness = {
  complete: boolean;
  completedCount: number;
  totalCount: 4;
  missing: TruckProfileRequirement[];
};

export type TruckAdminStatus = 'Archived' | 'Test' | 'Incomplete' | 'Inactive' | 'Active';

const normalize = (value?: string | null): string => value?.trim() ?? '';

/**
 * Broader owner/admin "profile polish" completeness (name, logo, hero, service area).
 * This is a coaching/admin-diagnostic signal, not the customer-visibility gate — a
 * truck can fail this and still be Public Ready. See lib/truckPublicReady.ts for
 * the canonical gate that actually determines customer visibility.
 */
export function getTruckProfileCompleteness(truck: FoodTruck): TruckProfileCompleteness {
  const name = normalize(truck.name);
  const logo = normalize(truck.logo);
  const hero = normalize(truck.hero_image);
  const serviceArea = normalize(truck.service_area);

  const requirements: Record<TruckProfileRequirement, boolean> = {
    name: name.length > 0,
    logo: logo.length > 0 && logo !== DEFAULT_TRUCK_LOGO_IMAGE,
    hero: hero.length > 0 && hero !== DEFAULT_TRUCK_HERO_IMAGE,
    service_area: serviceArea.length > 0,
  };

  const missing = (Object.keys(requirements) as TruckProfileRequirement[])
    .filter(requirement => !requirements[requirement]);
  const completedCount = 4 - missing.length;

  return {
    complete: missing.length === 0,
    completedCount,
    totalCount: 4,
    missing,
  };
}

export function isTruckProfileComplete(truck: FoodTruck): boolean {
  return getTruckProfileCompleteness(truck).complete;
}

/**
 * The actual customer-visibility gate: a truck is viewable by a non-owner/non-admin
 * customer only once it is Public Ready (lib/truckPublicReady.ts). Despite the name,
 * this is intentionally NOT based on the broader `isTruckProfileComplete` coaching
 * completeness above — service area (and, for legacy trucks, bio) must never hide an
 * otherwise Public Ready truck from customers.
 */
export function canViewIncompleteTruckProfile(
  truck: FoodTruck,
  viewer?: Pick<User, 'id' | 'role' | 'truck_id'> | null,
  publicReadyOptions?: PublicReadyEvaluationOptions,
): boolean {
  if (isTruckPublicReady(truck, publicReadyOptions)) return true;
  if (viewer?.role === 'admin') return true;
  return (
    (!!viewer?.id && truck.owner_id === viewer.id) ||
    (viewer?.role === 'truck' && viewer.truck_id === truck.id)
  );
}

export function getTruckAdminStatus(truck: FoodTruck, inactive: boolean): TruckAdminStatus {
  if (truck.archived === true || !!truck.archivedAt) return 'Archived';
  if (truck.is_test === true) return 'Test';
  if (!isTruckProfileComplete(truck)) return 'Incomplete';
  if (inactive) return 'Inactive';
  return 'Active';
}
