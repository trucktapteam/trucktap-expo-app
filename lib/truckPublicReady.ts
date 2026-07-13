import { DEFAULT_TRUCK_HERO_IMAGE, DEFAULT_TRUCK_LOGO_IMAGE } from '@/constants/truckDefaults';
import { FoodTruck } from '@/types';

/**
 * Bio became a Public Ready requirement with TruckTap 2.0. Trucks created
 * before this cutoff are grandfathered and are never required to add a bio
 * to remain publicly visible — only trucks created on or after this cutoff
 * must supply one. Revisit this cutoff once legacy-truck bio adoption is
 * sufficiently high.
 */
export const PUBLIC_READY_BIO_REQUIRED_AT = '2026-07-19T00:00:00Z';

const PUBLIC_READY_BIO_REQUIRED_AT_MS = Date.parse(PUBLIC_READY_BIO_REQUIRED_AT);

export type PublicReadyRequirement = 'name' | 'logo' | 'hero' | 'bio';

export type PublicReadyStatus = {
  complete: boolean;
  missing: PublicReadyRequirement[];
  isLegacy: boolean;
  bioRequired: boolean;
};

type PublicReadyTruckInput = Pick<FoodTruck, 'name' | 'logo' | 'hero_image' | 'bio' | 'created_at'>;

const normalize = (value?: string | null): string => value?.trim() ?? '';

/**
 * A truck is legacy (grandfathered from the bio requirement) when it was
 * created before the Public Ready rollout, or when its creation time is
 * missing/invalid and therefore cannot be proven to be a new truck.
 */
export function isLegacyTruck(truck: Pick<FoodTruck, 'created_at'>): boolean {
  const createdAt = truck.created_at;
  if (!createdAt) return true;

  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return true;

  return parsed < PUBLIC_READY_BIO_REQUIRED_AT_MS;
}

export function isBioRequiredForTruck(truck: Pick<FoodTruck, 'created_at'>): boolean {
  return !isLegacyTruck(truck);
}

/** The full set of Public Ready requirement keys that apply to this truck (bio only for non-legacy trucks). */
export function getPublicReadyRequirementKeys(truck: Pick<FoodTruck, 'created_at'>): PublicReadyRequirement[] {
  return isBioRequiredForTruck(truck) ? ['name', 'logo', 'hero', 'bio'] : ['name', 'logo', 'hero'];
}

export function getPublicReadyStatus(truck: PublicReadyTruckInput): PublicReadyStatus {
  const name = normalize(truck.name);
  const logo = normalize(truck.logo);
  const hero = normalize(truck.hero_image);
  const bio = normalize(truck.bio);
  const legacy = isLegacyTruck(truck);
  const bioRequired = !legacy;

  const missing: PublicReadyRequirement[] = [];
  if (name.length === 0) missing.push('name');
  if (logo.length === 0 || logo === DEFAULT_TRUCK_LOGO_IMAGE) missing.push('logo');
  if (hero.length === 0 || hero === DEFAULT_TRUCK_HERO_IMAGE) missing.push('hero');
  if (bioRequired && bio.length === 0) missing.push('bio');

  return {
    complete: missing.length === 0,
    missing,
    isLegacy: legacy,
    bioRequired,
  };
}

export function isTruckPublicReady(truck: PublicReadyTruckInput): boolean {
  return getPublicReadyStatus(truck).complete;
}
