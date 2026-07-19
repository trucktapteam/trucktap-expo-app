import { Sighting } from '@/types';

type AddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GeocodeResult = {
  formatted_address?: string;
  types?: string[];
  address_components?: AddressComponent[];
};

type GeocodeResponse = {
  status?: string;
  results?: GeocodeResult[];
};

const reverseGeocodeCache = new Map<string, Partial<Sighting>>();

const cleanText = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const firstText = (...values: unknown[]) => {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
};

const getNestedLocationAddress = (sighting: Sighting) => {
  const location = (sighting as Sighting & {
    location?: { address?: string | null };
  }).location;
  return location?.address;
};

const getCoordinateText = (sighting: Pick<Sighting, 'latitude' | 'longitude'>) => {
  if (
    !Number.isFinite(sighting.latitude) ||
    !Number.isFinite(sighting.longitude)
  ) {
    return null;
  }

  return `${sighting.latitude.toFixed(5)}, ${sighting.longitude.toFixed(5)}`;
};

export const getSightingLocationText = (sighting?: Sighting | null) => {
  if (!sighting) return 'Location unavailable';

  const businessOrLocationName = firstText(
    sighting.business_name,
    sighting.location_name,
    sighting.venue_name,
    sighting.place_name,
    sighting.resolved_location_name
  );
  if (businessOrLocationName) return businessOrLocationName;

  const streetAddress = firstText(
    sighting.street_address,
    sighting.address,
    sighting.location_address,
    sighting.formatted_address,
    getNestedLocationAddress(sighting),
    sighting.resolved_street_address
  );
  if (streetAddress) return streetAddress;

  const city = firstText(sighting.city, sighting.resolved_city);
  const state = firstText(sighting.state, sighting.resolved_state);
  const cityState = [city, state].filter(Boolean).join(', ');
  if (cityState) return cityState;

  return getCoordinateText(sighting) ?? 'Location unavailable';
};

const getAddressComponent = (
  result: GeocodeResult | undefined,
  acceptedTypes: string[]
) => {
  const component = result?.address_components?.find(candidate =>
    candidate.types?.some(type => acceptedTypes.includes(type))
  );
  return component ?? null;
};

export const mapReverseGeocodeResult = (
  response: GeocodeResponse
): Partial<Sighting> => {
  if (response.status !== 'OK' || !response.results?.length) return {};

  const results = response.results;
  const primary = results[0];
  const namedResult = results.find(result =>
    result.types?.some(type =>
      ['establishment', 'point_of_interest'].includes(type)
    )
  );
  const nameComponent = getAddressComponent(namedResult, [
    'establishment',
    'point_of_interest',
  ]);
  const namedFormattedAddress = cleanText(namedResult?.formatted_address);
  const formattedLocationName = namedFormattedAddress
    ? cleanText(namedFormattedAddress.split(',')[0])
    : null;
  const streetNumber = getAddressComponent(primary, ['street_number']);
  const route = getAddressComponent(primary, ['route']);
  const city = getAddressComponent(primary, [
    'locality',
    'postal_town',
    'sublocality',
    'administrative_area_level_2',
  ]);
  const state = getAddressComponent(primary, ['administrative_area_level_1']);
  const explicitStreet = [
    cleanText(streetNumber?.long_name),
    cleanText(route?.long_name),
  ].filter(Boolean).join(' ');

  return {
    resolved_location_name:
      cleanText(nameComponent?.long_name) ?? formattedLocationName,
    resolved_street_address:
      cleanText(explicitStreet) ?? cleanText(primary.formatted_address),
    resolved_city: cleanText(city?.long_name),
    resolved_state:
      cleanText(state?.short_name) ?? cleanText(state?.long_name),
  };
};

const hasFriendlyLocation = (sighting: Sighting) =>
  getSightingLocationText({
    ...sighting,
    latitude: Number.NaN,
    longitude: Number.NaN,
  }) !== 'Location unavailable';

const getCacheKey = (sighting: Pick<Sighting, 'latitude' | 'longitude'>) =>
  `${sighting.latitude.toFixed(5)},${sighting.longitude.toFixed(5)}`;

const reverseGeocodeSighting = async (
  sighting: Sighting,
  apiKey: string
): Promise<Sighting> => {
  if (hasFriendlyLocation(sighting)) return sighting;

  const cacheKey = getCacheKey(sighting);
  const cached = reverseGeocodeCache.get(cacheKey);
  if (cached) return { ...sighting, ...cached };

  try {
    const query = new URLSearchParams({
      latlng: `${sighting.latitude},${sighting.longitude}`,
      key: apiKey,
    });
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?${query.toString()}`
    );
    if (!response.ok) return sighting;

    const resolved = mapReverseGeocodeResult(
      await response.json() as GeocodeResponse
    );
    reverseGeocodeCache.set(cacheKey, resolved);
    return { ...sighting, ...resolved };
  } catch {
    return sighting;
  }
};

export const addDisplayLocationsToSightings = async (
  sightings: Sighting[]
): Promise<Sighting[]> => {
  const apiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  if (!apiKey) return sightings;

  return Promise.all(
    sightings.map(sighting => reverseGeocodeSighting(sighting, apiKey))
  );
};
