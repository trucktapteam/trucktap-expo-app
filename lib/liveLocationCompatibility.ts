export type RequestedLiveLocation = {
  latitude: number;
  longitude: number;
  label: string;
};

export type PersistedLiveLocation = {
  truck_id: string | number;
  latitude?: number | null;
  longitude?: number | null;
  label?: string | null;
};

const normalizeLocationLabel = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.trim() : '';

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
    && row.latitude === requested.latitude
    && row.longitude === requested.longitude
    && normalizeLocationLabel(row.label) === normalizeLocationLabel(requested.label)
  ) ?? null;
};
