import type { UpcomingStop } from '@/types';

export type TruckSnapshotTileId = 'scheduledStops' | 'liveStatus' | 'qrScans' | 'reviews' | 'checkIns';

export type TruckSnapshotTile = {
  id: TruckSnapshotTileId;
  label: string;
  value: string;
  detail: string;
};

export type TruckBusinessSnapshotInput = {
  truckId?: string | number | null;
  upcomingStops?: UpcomingStop[];
  openNow?: boolean;
  liveUpdatedText?: string;
  qrTotalScans?: number;
  reviewsCount?: number;
  reviewsAverage?: number;
  checkInsThisMonth?: number;
  now?: number;
};

const isTruckScoped = (
  itemTruckId: string | number | null | undefined,
  truckId: string | number | null | undefined
): boolean => itemTruckId?.toString() === truckId?.toString();

const isFutureStop = (stop: UpcomingStop, now: number): boolean => {
  if (stop.status === 'cancelled' || stop.status === 'completed') return false;
  const startsAt = Date.parse(stop.starts_at);
  return Number.isFinite(startsAt) && startsAt > now;
};

/**
 * Assembles the Business Snapshot tiles from data the caller has already
 * computed elsewhere (getQrScanStats, useTruckRating, getTruckAnalytics,
 * upcomingStops). Pure - fetches nothing itself, and only surfaces metrics
 * that are real today (no LIVE-session count, no favorites - see plan notes).
 */
export function getTruckBusinessSnapshot(input: TruckBusinessSnapshotInput): TruckSnapshotTile[] {
  const now = input.now ?? Date.now();
  const scheduledStopsCount = (input.upcomingStops ?? []).filter(
    stop => isTruckScoped(stop.truck_id, input.truckId) && isFutureStop(stop, now)
  ).length;

  const reviewsCount = input.reviewsCount ?? 0;
  const reviewsAverage = input.reviewsAverage ?? 0;
  const checkInsThisMonth = input.checkInsThisMonth ?? 0;

  return [
    {
      id: 'scheduledStops',
      label: 'Scheduled Stops',
      value: String(scheduledStopsCount),
      detail: scheduledStopsCount === 1 ? 'stop coming up' : 'stops coming up',
    },
    {
      id: 'liveStatus',
      label: 'Live Status',
      value: input.openNow ? 'LIVE Now' : 'Not LIVE',
      detail: input.openNow ? 'Customers can find you right now' : (input.liveUpdatedText ?? ''),
    },
    {
      id: 'qrScans',
      label: 'QR Scans',
      value: String(input.qrTotalScans ?? 0),
      detail: 'total scans',
    },
    {
      id: 'reviews',
      label: 'Reviews',
      value: String(reviewsCount),
      detail: reviewsCount > 0 ? `${reviewsAverage.toFixed(1)} average` : 'no reviews yet',
    },
    {
      id: 'checkIns',
      label: 'Check-Ins',
      value: String(checkInsThisMonth),
      detail: 'this month',
    },
  ];
}
