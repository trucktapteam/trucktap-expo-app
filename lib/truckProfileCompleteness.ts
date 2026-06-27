import { DEFAULT_TRUCK_HERO_IMAGE, DEFAULT_TRUCK_LOGO_IMAGE } from '@/constants/truckDefaults';
import { FoodTruck, User } from '@/types';

export type TruckProfileRequirement = 'name' | 'logo' | 'hero';

export type TruckProfileCompleteness = {
  complete: boolean;
  completedCount: number;
  totalCount: 3;
  missing: TruckProfileRequirement[];
};

export type TruckAdminStatus = 'Archived' | 'Test' | 'Incomplete' | 'Inactive' | 'Active';

const normalize = (value?: string | null): string => value?.trim() ?? '';

export function getTruckProfileCompleteness(truck: FoodTruck): TruckProfileCompleteness {
  const name = normalize(truck.name);
  const logo = normalize(truck.logo);
  const hero = normalize(truck.hero_image);

  const requirements: Record<TruckProfileRequirement, boolean> = {
    name: name.length > 0,
    logo: logo.length > 0 && logo !== DEFAULT_TRUCK_LOGO_IMAGE,
    hero: hero.length > 0 && hero !== DEFAULT_TRUCK_HERO_IMAGE,
  };

  const missing = (Object.keys(requirements) as TruckProfileRequirement[])
    .filter(requirement => !requirements[requirement]);
  const completedCount = 3 - missing.length;

  return {
    complete: missing.length === 0,
    completedCount,
    totalCount: 3,
    missing,
  };
}

export function isTruckProfileComplete(truck: FoodTruck): boolean {
  return getTruckProfileCompleteness(truck).complete;
}

export function canViewIncompleteTruckProfile(
  truck: FoodTruck,
  viewer?: Pick<User, 'id' | 'role' | 'truck_id'> | null
): boolean {
  if (isTruckProfileComplete(truck)) return true;
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
