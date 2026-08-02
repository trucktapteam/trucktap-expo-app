import type { UpcomingStop } from '@/types';

// Deliberately not importing TruckCoachMilestoneCelebration from
// truckCoachProgress.ts here - that module pulls in AsyncStorage at load
// time, which this pure module has no other reason to depend on. Same shape,
// structurally compatible with what dashboard.tsx actually passes in.
type MilestoneCelebration = { id: string; message: string };

export type TruckWinKind = 'milestone' | 'recurring' | 'fallback';

export type TruckWin = {
  id: string;
  kind: TruckWinKind;
  message: string;
};

export type TruckRecurringWinInput = {
  truckId?: string | number | null;
  upcomingStops?: UpcomingStop[];
  openNow?: boolean;
  checkInsThisMonth?: number;
  now?: number;
};

const RECENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const isTruckScoped = (
  itemTruckId: string | number | null | undefined,
  truckId: string | number | null | undefined
): boolean => itemTruckId?.toString() === truckId?.toString();

const countStopsScheduledThisWeek = (input: TruckRecurringWinInput, now: number): number =>
  (input.upcomingStops ?? []).filter(stop => {
    if (!isTruckScoped(stop.truck_id, input.truckId)) return false;
    const createdAt = stop.created_at ? Date.parse(stop.created_at) : NaN;
    return Number.isFinite(createdAt) && now - createdAt <= RECENT_WINDOW_MS && now - createdAt >= 0;
  }).length;

export const fallbackTruckWin: TruckWin = {
  id: 'fallback',
  kind: 'fallback',
  message: 'Keep it up - every update makes your truck easier for customers to find.',
};

/**
 * Recomputed on every load (unlike milestone celebrations, which only ever
 * show once) - this is the "reinforce good habits while they're happening"
 * half of Wins. Picks a single best-applicable line by fixed priority.
 */
export function getRecurringTruckWin(input: TruckRecurringWinInput): TruckWin | null {
  const now = input.now ?? Date.now();
  const stopsThisWeek = countStopsScheduledThisWeek(input, now);

  if (stopsThisWeek >= 2) {
    return {
      id: 'stops-scheduled-this-week',
      kind: 'recurring',
      message: `Great job! You scheduled ${stopsThisWeek} stops this week.`,
    };
  }

  if (input.openNow) {
    return {
      id: 'live-now',
      kind: 'recurring',
      message: "You're LIVE right now - customers can find you!",
    };
  }

  const checkInsThisMonth = input.checkInsThisMonth ?? 0;
  if (checkInsThisMonth > 0) {
    return {
      id: 'check-ins-this-month',
      kind: 'recurring',
      message: `${checkInsThisMonth} customer${checkInsThisMonth === 1 ? ' has' : 's have'} checked in with you this month.`,
    };
  }

  return null;
}

/** Combines a (rare, one-time) milestone celebration with the (recomputed every load) recurring win. Never empty. */
export function getTruckWins(
  milestoneCelebration: MilestoneCelebration | null,
  recurringWin: TruckWin | null
): TruckWin[] {
  const wins: TruckWin[] = [];

  if (milestoneCelebration) {
    wins.push({
      id: milestoneCelebration.id,
      kind: 'milestone',
      message: milestoneCelebration.message,
    });
  }

  if (recurringWin) {
    wins.push(recurringWin);
  }

  if (wins.length === 0) {
    wins.push(fallbackTruckWin);
  }

  return wins.slice(0, 2);
}
