import { DEFAULT_TRUCK_HERO_IMAGE, DEFAULT_TRUCK_LOGO_IMAGE } from '@/constants/truckDefaults';
import { FoodTruck } from '@/types';

export type TruckVisibilitySetupRequirement = 'name' | 'logo' | 'hero';

export type TruckVisibilitySetupStatus = {
  complete: boolean;
  missing: TruckVisibilitySetupRequirement[];
};

const normalize = (value?: string | null): string => value?.trim() ?? '';

export function getTruckVisibilitySetupStatus(truck: FoodTruck): TruckVisibilitySetupStatus {
  const name = normalize(truck.name);
  const logo = normalize(truck.logo);
  const hero = normalize(truck.hero_image);

  const requirements: Record<TruckVisibilitySetupRequirement, boolean> = {
    name: name.length > 0,
    logo: logo.length > 0 && logo !== DEFAULT_TRUCK_LOGO_IMAGE,
    hero: hero.length > 0 && hero !== DEFAULT_TRUCK_HERO_IMAGE,
  };

  const missing = (Object.keys(requirements) as TruckVisibilitySetupRequirement[])
    .filter(requirement => !requirements[requirement]);

  return {
    complete: missing.length === 0,
    missing,
  };
}

export function isTruckVisibilitySetupComplete(truck: FoodTruck): boolean {
  return getTruckVisibilitySetupStatus(truck).complete;
}
