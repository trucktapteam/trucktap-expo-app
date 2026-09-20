// Single source of truth for "is this upcoming_stops row still relevant right now".
// Consumers (AppContext, UpcomingStopsRow, ...) should all funnel through this
// module instead of re-deriving the same starts_at/ends_at/status checks, so a
// stop can never leak through one call site just because another happens to
// filter it out at render time.

export type UpcomingStopStatusLike = 'scheduled' | 'delayed' | 'cancelled' | 'sold_out' | 'completed' | string;

export type UpcomingStopLike = {
  truck_id?: string | null;
  starts_at: string;
  ends_at: string;
  status: UpcomingStopStatusLike;
};

const INACTIVE_STATUSES = new Set(['cancelled', 'completed']);

/**
 * A stop is visible to customers while its window hasn't ended yet
 * (ends_at > now), regardless of whether it has started — so a stop the
 * truck is currently sitting at still surfaces as relevant. Cancelled and
 * completed stops are excluded outright; malformed/missing ends_at is
 * treated as not visible rather than defaulting to "visible forever".
 */
export const isUpcomingStopCurrentlyVisible = (
  stop: Pick<UpcomingStopLike, 'status' | 'ends_at'>,
  now: number = Date.now()
): boolean => {
  if (INACTIVE_STATUSES.has(stop.status)) return false;

  const endsAt = Date.parse(stop.ends_at);
  return Number.isFinite(endsAt) && endsAt > now;
};

/**
 * All currently-visible stops for a truck, soonest start first. A stop
 * already in progress (starts_at in the past, ends_at in the future) sorts
 * ahead of a later one, which is what "next relevant stop" should mean.
 */
export const getVisibleUpcomingStopsForTruck = <T extends UpcomingStopLike>(
  stops: readonly T[],
  truckId: string,
  now: number = Date.now()
): T[] => {
  const requestedId = truckId?.toString() ?? '';

  return stops
    .filter((stop) => stop.truck_id?.toString() === requestedId)
    .filter((stop) => isUpcomingStopCurrentlyVisible(stop, now))
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
};

export const getNextUpcomingStopForTruck = <T extends UpcomingStopLike>(
  stops: readonly T[],
  truckId: string,
  now: number = Date.now()
): T | null => getVisibleUpcomingStopsForTruck(stops, truckId, now)[0] ?? null;
