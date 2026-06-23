import { DEFAULT_TRUCK_HERO_IMAGE, DEFAULT_TRUCK_LOGO_IMAGE } from '@/constants/truckDefaults';
import { FoodTruck } from '@/types';

export type TruckProfileRequirement = 'name' | 'cuisine' | 'logo' | 'hero';

export type TruckProfileCompleteness = {
  complete: boolean;
  completedCount: number;
  totalCount: 4;
  missing: TruckProfileRequirement[];
};

export type TruckAdminStatus = 'Archived' | 'Test' | 'Incomplete' | 'Inactive' | 'Active';

const normalize = (value?: string | null): string => value?.trim() ?? '';

export function getTruckProfileCompleteness(truck: FoodTruck): TruckProfileCompleteness {
  const name = normalize(truck.name);
  const cuisine = normalize(truck.cuisine_type);
  const logo = normalize(truck.logo);
  const hero = normalize(truck.hero_image);

  const requirements: Record<TruckProfileRequirement, boolean> = {
    name: name.length > 0,
    cuisine: cuisine.length > 0 && cuisine.toLowerCase() !== 'unspecified',
    logo: logo.length > 0 && logo !== DEFAULT_TRUCK_LOGO_IMAGE,
    hero: hero.length > 0 && hero !== DEFAULT_TRUCK_HERO_IMAGE,
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

export function getTruckAdminStatus(truck: FoodTruck, inactive: boolean): TruckAdminStatus {
  if (truck.archived === true || !!truck.archivedAt) return 'Archived';
  if (truck.is_test === true) return 'Test';
  if (!isTruckProfileComplete(truck)) return 'Incomplete';
  if (inactive) return 'Inactive';
  return 'Active';
}
