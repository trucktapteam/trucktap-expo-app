import { FoodTruck } from '@/types';

export const CLUSTER_BREAKPOINT_DELTA = 0.035;
const GRID_DIVISOR = 12;

export type MapRegionLike = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

export type TruckMarkerCluster =
  | {
      type: 'truck';
      truck: FoodTruck;
    }
  | {
      type: 'cluster';
      id: string;
      latitude: number;
      longitude: number;
      count: number;
      trucks: FoodTruck[];
    };

export function clusterTruckMarkers(
  trucks: FoodTruck[],
  region: MapRegionLike
): TruckMarkerCluster[] {
  if (
    region.latitudeDelta <= CLUSTER_BREAKPOINT_DELTA &&
    region.longitudeDelta <= CLUSTER_BREAKPOINT_DELTA
  ) {
    return trucks.map((truck) => ({
      type: 'truck',
      truck,
    }));
  }

  const latCellSize = Math.max(region.latitudeDelta / GRID_DIVISOR, 0.0025);
  const lngCellSize = Math.max(region.longitudeDelta / GRID_DIVISOR, 0.0025);
  const buckets = new Map<string, FoodTruck[]>();

  for (const truck of trucks) {
    const latBucket = Math.floor(truck.location.latitude / latCellSize);
    const lngBucket = Math.floor(truck.location.longitude / lngCellSize);
    const key = `${latBucket}:${lngBucket}`;
    const existing = buckets.get(key);

    if (existing) {
      existing.push(truck);
    } else {
      buckets.set(key, [truck]);
    }
  }

  return Array.from(buckets.entries()).map(([key, groupedTrucks]) => {
    if (groupedTrucks.length === 1) {
      return {
        type: 'truck' as const,
        truck: groupedTrucks[0],
      };
    }

    const latitude =
      groupedTrucks.reduce((sum, truck) => sum + truck.location.latitude, 0) / groupedTrucks.length;
    const longitude =
      groupedTrucks.reduce((sum, truck) => sum + truck.location.longitude, 0) / groupedTrucks.length;

    return {
      type: 'cluster' as const,
      id: key,
      latitude,
      longitude,
      count: groupedTrucks.length,
      trucks: groupedTrucks,
    };
  });
}
