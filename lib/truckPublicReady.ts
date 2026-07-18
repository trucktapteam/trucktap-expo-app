import { PUBLIC_READY_ENFORCEMENT_POLICY } from '../constants/publicReady';
import type { PublicReadyEnforcementPolicy } from '../constants/publicReady';
import {
  DEFAULT_TRUCK_HERO_IMAGE,
  DEFAULT_TRUCK_LOGO_IMAGE,
} from '../constants/truckDefaults';
import type { FoodTruck } from '../types';

/**
 * Bio became a Public Ready requirement with TruckTap 2.0. Trucks created
 * before the configured cohort boundary are grandfathered while legacy
 * enforcement is disabled. Trucks created on or after the cohort boundary
 * must supply one immediately.
 */

export type PublicReadyRequirement = 'name' | 'logo' | 'hero' | 'bio';

export type PublicReadyStatus = {
  complete: boolean;
  missing: PublicReadyRequirement[];
  isLegacy: boolean;
  bioRequired: boolean;
};

type PublicReadyTruckInput = Pick<
  FoodTruck,
  'name' | 'logo' | 'hero_image' | 'bio' | 'created_at'
>;

export type PublicReadyEvaluationOptions = {
  now?: string | number | Date;
  policy?: PublicReadyEnforcementPolicy;
};

const normalize = (value?: string | null): string => value?.trim() ?? '';

const parseTimestamp = (value: string | number | Date): number => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(value);
};

const getPolicy = (
  options?: PublicReadyEvaluationOptions,
): PublicReadyEnforcementPolicy =>
  options?.policy ?? PUBLIC_READY_ENFORCEMENT_POLICY;

/**
 * A truck belongs to the legacy cohort when it was created before the Public
 * Ready rollout, or when its creation time is missing/invalid and it therefore
 * cannot be proven to be a new truck.
 */
export function isLegacyTruck(
  truck: Pick<FoodTruck, 'created_at'>,
  options?: PublicReadyEvaluationOptions,
): boolean {
  const createdAt = truck.created_at;
  if (!createdAt) return true;

  const parsed = Date.parse(createdAt);
  if (!Number.isFinite(parsed)) return true;

  return parsed < Date.parse(getPolicy(options).newTruckBioRequiredAt);
}

export function isLegacyTruckBioEnforcementActive(
  options?: PublicReadyEvaluationOptions,
): boolean {
  const enforcementAt = getPolicy(options).legacyTruckBioEnforcementAt;
  if (!enforcementAt) return false;

  const enforcementAtMs = Date.parse(enforcementAt);
  const nowMs = parseTimestamp(options?.now ?? Date.now());
  return Number.isFinite(enforcementAtMs)
    && Number.isFinite(nowMs)
    && nowMs >= enforcementAtMs;
}

export function isBioRequiredForTruck(
  truck: Pick<FoodTruck, 'created_at'>,
  options?: PublicReadyEvaluationOptions,
): boolean {
  return !isLegacyTruck(truck, options)
    || isLegacyTruckBioEnforcementActive(options);
}

/** The Public Ready requirement keys that apply to this truck. */
export function getPublicReadyRequirementKeys(
  truck: Pick<FoodTruck, 'created_at'>,
  options?: PublicReadyEvaluationOptions,
): PublicReadyRequirement[] {
  return isBioRequiredForTruck(truck, options)
    ? ['name', 'logo', 'hero', 'bio']
    : ['name', 'logo', 'hero'];
}

export function getPublicReadyStatus(
  truck: PublicReadyTruckInput,
  options?: PublicReadyEvaluationOptions,
): PublicReadyStatus {
  const name = normalize(truck.name);
  const logo = normalize(truck.logo);
  const hero = normalize(truck.hero_image);
  const bio = normalize(truck.bio);
  const legacy = isLegacyTruck(truck, options);
  const bioRequired = isBioRequiredForTruck(truck, options);

  const missing: PublicReadyRequirement[] = [];
  if (name.length === 0) missing.push('name');
  if (logo.length === 0 || logo === DEFAULT_TRUCK_LOGO_IMAGE) {
    missing.push('logo');
  }
  if (hero.length === 0 || hero === DEFAULT_TRUCK_HERO_IMAGE) {
    missing.push('hero');
  }
  if (bioRequired && bio.length === 0) missing.push('bio');

  return {
    complete: missing.length === 0,
    missing,
    isLegacy: legacy,
    bioRequired,
  };
}

export function isTruckPublicReady(
  truck: PublicReadyTruckInput,
  options?: PublicReadyEvaluationOptions,
): boolean {
  return getPublicReadyStatus(truck, options).complete;
}
