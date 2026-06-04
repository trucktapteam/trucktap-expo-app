export type MapCoordinateLike = {
  latitude: unknown;
  longitude: unknown;
};

export type MapRegionLike = {
  latitude: unknown;
  longitude: unknown;
  latitudeDelta: unknown;
  longitudeDelta: unknown;
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && !Number.isNaN(value);
const loggedInvalidCoordinateLabels = new Set<string>();
const loggedSkippedTruckMarkerLabels = new Set<string>();
const FALLBACK_TRUCK_COORDINATES = [
  { latitude: 37.7749, longitude: -122.4194, label: 'San Francisco fallback' },
];
const FALLBACK_COORDINATE_EPSILON = 0.00001;

export const isValidLatitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -90 && value <= 90;

export const isValidLongitude = (value: unknown): value is number =>
  isFiniteNumber(value) && value >= -180 && value <= 180;

export const isValidCoordinate = (
  coordinate: MapCoordinateLike | null | undefined
): coordinate is { latitude: number; longitude: number } =>
  !!coordinate &&
  isValidLatitude(coordinate.latitude) &&
  isValidLongitude(coordinate.longitude);

export const getValidatedCoordinate = (
  label: string,
  coordinate: MapCoordinateLike | null | undefined
) => {
  if (isValidCoordinate(coordinate)) {
    return {
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
    };
  }

  if (__DEV__) {
    if (!loggedInvalidCoordinateLabels.has(label)) {
      loggedInvalidCoordinateLabels.add(label);
      console.log(`[Map] Skipping invalid coordinate for ${label}`, coordinate);
    }
  }

  return null;
};

const isFallbackTruckCoordinate = (coordinate: { latitude: number; longitude: number }) =>
  FALLBACK_TRUCK_COORDINATES.some(fallback =>
    Math.abs(coordinate.latitude - fallback.latitude) < FALLBACK_COORDINATE_EPSILON &&
    Math.abs(coordinate.longitude - fallback.longitude) < FALLBACK_COORDINATE_EPSILON
  );

export const getValidatedTruckMarkerCoordinate = (
  label: string,
  coordinate: MapCoordinateLike | null | undefined
) => {
  const validated = getValidatedCoordinate(label, coordinate);

  if (!validated) {
    if (__DEV__ && !loggedSkippedTruckMarkerLabels.has(label)) {
      loggedSkippedTruckMarkerLabels.add(label);
      console.warn(`[Map] Skipping truck marker without valid coordinates for ${label}`, coordinate);
    }
    return null;
  }

  if (isFallbackTruckCoordinate(validated)) {
    if (__DEV__ && !loggedSkippedTruckMarkerLabels.has(label)) {
      loggedSkippedTruckMarkerLabels.add(label);
      console.warn(`[Map] Skipping truck marker with fallback coordinates for ${label}`, coordinate);
    }
    return null;
  }

  return validated;
};

export const isValidMapRegion = (
  region: MapRegionLike | null | undefined
): region is {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
} =>
  !!region &&
  isValidLatitude(region.latitude) &&
  isValidLongitude(region.longitude) &&
  isFiniteNumber(region.latitudeDelta) &&
  isFiniteNumber(region.longitudeDelta) &&
  region.latitudeDelta > 0 &&
  region.longitudeDelta > 0 &&
  region.latitudeDelta <= 180 &&
  region.longitudeDelta <= 360;

export const areMapRegionsEqual = (
  left: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  right: {
    latitude: number;
    longitude: number;
    latitudeDelta: number;
    longitudeDelta: number;
  },
  epsilon = 0.0001
) =>
  Math.abs(left.latitude - right.latitude) < epsilon &&
  Math.abs(left.longitude - right.longitude) < epsilon &&
  Math.abs(left.latitudeDelta - right.latitudeDelta) < epsilon &&
  Math.abs(left.longitudeDelta - right.longitudeDelta) < epsilon;
