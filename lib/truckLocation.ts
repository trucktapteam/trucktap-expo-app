type LocationLike = {
  label?: string | null;
  address?: string | null;
};

type TruckLocationLike = {
  location?: LocationLike | null;
  liveLocation?: LocationLike | null;
  address?: string | null;
};

const firstReadableValue = (values: (string | null | undefined)[]) => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
};

// The truck's specific LIVE or scheduled-event location - used wherever a
// customer needs to actually navigate to the truck right now.
export const getTruckDisplayLocation = (truck: TruckLocationLike) =>
  firstReadableValue([
    truck.location?.label,
    truck.location?.address,
    truck.liveLocation?.label,
    truck.liveLocation?.address,
    truck.address,
  ]) ?? 'Location available';

type TruckHomeGeographyLike = {
  home_city?: string | null;
  home_state?: string | null;
};

/**
 * The truck's general identity/home location (e.g. "Louisville, KY"), built
 * only from home_city/home_state. Deliberately does not fall back to a full
 * street address when that data is missing - callers should omit the line
 * entirely rather than guess a street-level location from other fields.
 */
export const getTruckGeneralLocationLabel = (truck: TruckHomeGeographyLike): string | null => {
  const city = truck.home_city?.trim();
  const state = truck.home_state?.trim();

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return null;
};
