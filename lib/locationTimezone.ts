import timezoneLookup from '@photostructure/tz-lookup';

const normalizeIanaTimezone = (timezone: string | null | undefined) => {
  const candidate = timezone?.trim();
  if (!candidate) return null;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format();
    return candidate;
  } catch {
    return null;
  }
};

export const getTimezoneForCoordinates = (
  latitude: number,
  longitude: number,
  geocodedTimezone?: string | null
) => {
  const nativeTimezone = normalizeIanaTimezone(geocodedTimezone);
  return nativeTimezone ?? timezoneLookup(latitude, longitude);
};

export const getDestinationLocation = (
  latitude: number,
  longitude: number,
  geocodedTimezone?: string | null
) => ({
  latitude,
  longitude,
  timezone: getTimezoneForCoordinates(latitude, longitude, geocodedTimezone),
});
