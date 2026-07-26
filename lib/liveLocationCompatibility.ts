export type RequestedLiveLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export type PersistedLiveLocation = {
  truck_id: string | number;
  latitude?: number | string | null;
  longitude?: number | string | null;
  label?: string | null;
};

const normalizeLocationLabel = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

// Absorbs float/string round-tripping through PostgREST (e.g. numeric
// columns serialized as strings, or minor precision drift) without masking
// a genuinely different location. ~1 meter at the equator.
const COORDINATE_MATCH_EPSILON_DEGREES = 0.00001;

const toFiniteNumber = (value: number | string | null | undefined): number | null => {
  const numeric = typeof value === 'string' ? Number(value) : value;
  return typeof numeric === 'number' && Number.isFinite(numeric) ? numeric : null;
};

const coordinatesMatch = (
  a: number | string | null | undefined,
  b: number | string | null | undefined,
): boolean => {
  const numericA = toFiniteNumber(a);
  const numericB = toFiniteNumber(b);
  return numericA !== null && numericB !== null
    && Math.abs(numericA - numericB) <= COORDINATE_MATCH_EPSILON_DEGREES;
};

export const rpcSupportsCanonicalLiveLocation = (rpcRow: unknown): boolean =>
  typeof rpcRow === 'object'
  && rpcRow !== null
  && Object.prototype.hasOwnProperty.call(rpcRow, 'live_stop_id');

export const findPersistedRequestedLiveLocation = <T extends PersistedLiveLocation>(
  rows: T[] | null | undefined,
  truckId: string,
  requested: RequestedLiveLocation,
): T | null => {
  if (!rows) return null;

  return rows.find(row =>
    row.truck_id?.toString() === truckId
    && coordinatesMatch(row.latitude, requested.latitude)
    && coordinatesMatch(row.longitude, requested.longitude)
    && normalizeLocationLabel(row.label) === normalizeLocationLabel(requested.label)
  ) ?? null;
};

// Best-effort fallback once the RPC has already confirmed Go LIVE succeeded:
// any persisted row for this truck is more useful to the dashboard than
// discarding location enrichment entirely over a non-matching value.
export const findAnyPersistedLocationForTruck = <T extends PersistedLiveLocation>(
  rows: T[] | null | undefined,
  truckId: string,
): T | null => {
  if (!rows) return null;

  return rows.find(row => row.truck_id?.toString() === truckId) ?? null;
};
