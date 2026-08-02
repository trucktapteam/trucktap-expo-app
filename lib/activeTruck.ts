export type ActiveTruckCandidate = {
  id: string;
  owner_id: string;
  archived?: boolean;
  archivedAt?: string | number;
  is_test?: boolean;
  created_at?: string;
};

export const getActiveTruckStorageKey = (userId: string): string =>
  `activeTruckId:${userId}`;

export const getTruckScopedStorageKey = (
  baseKey: string,
  userId: string,
  truckId: string
): string => `${baseKey}:${userId}:${truckId}`;

export const isEligiblePartnerTruck = <T extends ActiveTruckCandidate>(
  truck: T,
  userId: string
): boolean =>
  truck.owner_id === userId &&
  truck.archived !== true &&
  !truck.archivedAt &&
  truck.is_test !== true;

export const getEligiblePartnerTrucks = <T extends ActiveTruckCandidate>(
  trucks: readonly T[],
  userId: string
): T[] =>
  trucks
    .filter(truck => isEligiblePartnerTruck(truck, userId))
    .sort((left, right) => {
      const leftCreatedAt = Date.parse(left.created_at ?? '');
      const rightCreatedAt = Date.parse(right.created_at ?? '');
      const leftTime = Number.isFinite(leftCreatedAt) ? leftCreatedAt : Number.MAX_SAFE_INTEGER;
      const rightTime = Number.isFinite(rightCreatedAt) ? rightCreatedAt : Number.MAX_SAFE_INTEGER;

      return leftTime - rightTime || left.id.localeCompare(right.id);
    });

/**
 * The owner-scoped counterpart to isEligiblePartnerTruck's archived exclusion:
 * same ownership and test-truck safety checks, but returns only the owner's
 * *archived* trucks -- the set the dedicated Archived Trucks management
 * screen needs, deliberately kept out of eligibleOwnedTrucks/the switcher.
 */
export const isArchivedPartnerTruck = <T extends ActiveTruckCandidate>(
  truck: T,
  userId: string
): boolean =>
  truck.owner_id === userId &&
  (truck.archived === true || !!truck.archivedAt) &&
  truck.is_test !== true;

export const getArchivedPartnerTrucks = <T extends ActiveTruckCandidate>(
  trucks: readonly T[],
  userId: string
): T[] =>
  trucks
    .filter(truck => isArchivedPartnerTruck(truck, userId))
    .sort((left, right) => left.id.localeCompare(right.id));

export type ActiveTruckResolution = {
  activeTruckId: string | null;
  source: 'persisted' | 'legacy-profile' | 'fallback' | 'none';
};

export const resolvePartnerActiveTruck = <T extends ActiveTruckCandidate>(input: {
  trucks: readonly T[];
  userId: string;
  persistedTruckId?: string | null;
  legacyProfileTruckId?: string | null;
}): ActiveTruckResolution => {
  const eligible = getEligiblePartnerTrucks(input.trucks, input.userId);
  const eligibleIds = new Set(eligible.map(truck => truck.id));

  if (input.persistedTruckId && eligibleIds.has(input.persistedTruckId)) {
    return { activeTruckId: input.persistedTruckId, source: 'persisted' };
  }

  if (input.legacyProfileTruckId && eligibleIds.has(input.legacyProfileTruckId)) {
    return { activeTruckId: input.legacyProfileTruckId, source: 'legacy-profile' };
  }

  if (eligible[0]) {
    return { activeTruckId: eligible[0].id, source: 'fallback' };
  }

  return { activeTruckId: null, source: 'none' };
};

export const getActiveTruckFromCandidates = <T extends ActiveTruckCandidate>(
  trucks: readonly T[],
  activeTruckId: string | null
): T | null => trucks.find(truck => truck.id === activeTruckId) ?? null;

/**
 * Resolves the truck a non-admin owner's dashboard should show. Prefers the
 * active eligible (non-archived) truck. Falls back to the owner's raw,
 * unfiltered truck list when eligibility resolution comes up empty -- e.g.
 * an owner whose only truck is archived still gets that truck back instead
 * of null, so the dashboard can show its existing read-only/archived state
 * rather than a dead-end "Truck not found".
 */
export const resolveOwnerActiveTruck = <T extends ActiveTruckCandidate>(input: {
  ownedTrucks: readonly T[];
  eligibleOwnedTrucks: readonly T[];
  activeTruckId: string | null;
}): T | null => {
  const activeTruck = getActiveTruckFromCandidates(input.eligibleOwnedTrucks, input.activeTruckId);
  if (activeTruck) return activeTruck;
  return input.ownedTrucks[0] ?? null;
};

export const shouldShowPartnerTruckSelector = (
  eligibleTrucks: readonly ActiveTruckCandidate[]
): boolean => eligibleTrucks.length > 1;

export const getRecordsForTruck = <T>(
  records: readonly T[],
  truckId: string,
  getTruckId: (record: T) => string | number | null | undefined
): T[] => records.filter(record => getTruckId(record)?.toString() === truckId.toString());

export const resolveAdminTruck = <T extends ActiveTruckCandidate>(input: {
  ownedTrucks: readonly T[];
  allTrucks: readonly T[];
  selectedAdminTruckId?: string | null;
  legacyProfileTruckId?: string | null;
}): T | null => {
  if (input.selectedAdminTruckId) {
    const selected = [...input.ownedTrucks, ...input.allTrucks]
      .find(truck => truck.id === input.selectedAdminTruckId);
    if (selected) return selected;
  }

  if (input.legacyProfileTruckId) {
    const legacy = input.ownedTrucks.find(truck => truck.id === input.legacyProfileTruckId);
    if (legacy) return legacy;
  }

  return input.ownedTrucks[0] ?? null;
};
