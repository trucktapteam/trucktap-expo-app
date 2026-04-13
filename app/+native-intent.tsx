import { getTruckRouteFromUrl } from '@/lib/truckShare';

export function redirectSystemPath({
  path,
  initial,
}: { path: string; initial: boolean }) {
  const truckRoute = getTruckRouteFromUrl(path);
  if (truckRoute) {
    return truckRoute;
  }

  return '/';
}
