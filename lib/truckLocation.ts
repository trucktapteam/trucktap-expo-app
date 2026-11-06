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
// customer needs to actually navigate to the truck right now. Only call this
// for a truck that is currently LIVE: offline trucks keep their last serving
// address in `locations`, and it must never be shown as a current location.
export const getTruckDisplayLocation = (truck: TruckLocationLike) =>
  firstReadableValue([
    truck.location?.label,
    truck.location?.address,
    truck.liveLocation?.label,
    truck.liveLocation?.address,
    truck.address,
  ]) ?? 'Location available';

// ---------------------------------------------------------------------------
// General (identity) location: city/state only, never a street address.
// ---------------------------------------------------------------------------

const STATE_NAME_TO_ABBREVIATION: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC',
};

const STATE_ABBREVIATIONS = new Set(Object.values(STATE_NAME_TO_ABBREVIATION));

const STREET_SUFFIXES = new Set([
  'st', 'street', 'rd', 'road', 'ave', 'avenue', 'blvd', 'boulevard', 'dr', 'drive',
  'ln', 'lane', 'way', 'hwy', 'highway', 'pkwy', 'parkway', 'cir', 'circle',
  'pl', 'place', 'ter', 'terr', 'terrace', 'trl', 'trail', 'loop', 'sq', 'square',
  'cv', 'cove', 'xing', 'crossing', 'byp', 'bypass', 'pike', 'aly', 'alley', 'run', 'path',
  'ct', 'court',
]);

const resolveState = (token: string): string | null => {
  const cleaned = token.trim().replace(/\.$/, '');
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (STATE_ABBREVIATIONS.has(upper)) return upper;
  return STATE_NAME_TO_ABBREVIATION[cleaned.toLowerCase()] ?? null;
};

const hasStreetSuffixWord = (text: string): boolean =>
  text
    .split(/[\s,/]+/)
    .map(word => word.toLowerCase().replace(/[.,]+$/, ''))
    .some(word => STREET_SUFFIXES.has(word));

/**
 * A candidate "city" that is not safely a plain place name: any digit, a
 * street-suffix last word, characters other than letters/space/.'-, or more
 * than four words (e.g. "Hardin County / Central", "Serving all of Metro").
 */
const looksLikeStreetFragment = (text: string): boolean => {
  if (/\d/.test(text)) return true;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(text.trim())) return true;
  if (text.trim().split(/\s+/).length > 4) return true;
  const words = text.trim().split(/\s+/);
  const lastWord = words[words.length - 1]?.toLowerCase().replace(/[.,]+$/, '');
  return lastWord ? STREET_SUFFIXES.has(lastWord) : false;
};

/**
 * Reduces owner-entered `service_area` free text to "City, ST", or null.
 *
 * Production data shows most owners typed a full street address here
 * (e.g. "300, Example Rd, Springfield, Kentucky"), and an earlier migration
 * also backfilled it from old serving addresses. This only ever returns a
 * city and a recognized US state, discarding any street number/name, and
 * fails closed (null) for anything it cannot reduce confidently. Same rules
 * as the website's `deriveHomeGeography` (trucktap-web src/lib/location.ts).
 */
export const deriveCityStateFromServiceArea = (serviceArea: string | null | undefined): string | null => {
  if (!serviceArea) return null;

  // A trailing ZIP/ZIP+4 is never shown and would block state matching.
  const value = serviceArea.trim().replace(/\s+\d{5}(-\d{4})?$/, '').trim();
  if (!value) return null;

  const parts = value
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    const city = parts[parts.length - 2];
    const state = resolveState(parts[parts.length - 1]);
    return state && city && !looksLikeStreetFragment(city) ? `${city}, ${state}` : null;
  }

  // No commas: "City ST" / "City State Name", preferring two-word state names.
  const words = value.split(/\s+/);
  for (const stateWordCount of [2, 1]) {
    if (words.length <= stateWordCount) continue;
    const state = resolveState(words.slice(-stateWordCount).join(' '));
    if (!state) continue;
    const city = words.slice(0, -stateWordCount).join(' ');
    return !looksLikeStreetFragment(city) ? `${city}, ${state}` : null;
  }

  return null;
};

type TruckGeneralLocationLike = {
  home_city?: string | null;
  home_state?: string | null;
  service_area?: string | null;
};

/**
 * The truck's general identity location, e.g. "Louisville, KY".
 * 1. home_city/home_state when present.
 * 2. Otherwise city/state derived from service_area, only when reliable.
 * 3. Otherwise null - callers omit the line rather than guess.
 * Never reads LIVE/last-serving locations and never returns a street address.
 */
export const getTruckGeneralLocationLabel = (truck: TruckGeneralLocationLike): string | null => {
  const city = truck.home_city?.trim();
  const state = truck.home_state?.trim();

  if (city && state) return `${city}, ${state}`;
  if (city) return city;
  if (state) return state;
  return deriveCityStateFromServiceArea(truck.service_area);
};

/** The one wording used on Discover, Favorites, and the truck profile header. */
export const getTruckBasedNearText = (truck: TruckGeneralLocationLike): string | null => {
  const label = getTruckGeneralLocationLabel(truck);
  return label ? `Based near ${label}` : null;
};

/**
 * True when free-text service_area reads like a described region (e.g.
 * "Hardin County / Central KY") rather than any part of a street address:
 * no digits and no street-suffix words. Used only to keep such text
 * searchable; it is never displayed.
 */
export const isRegionDescription = (serviceArea: string | null | undefined): boolean => {
  const value = serviceArea?.trim();
  if (!value) return false;
  return !/\d/.test(value) && !hasStreetSuffixWord(value);
};

type TruckSearchLike = TruckGeneralLocationLike & {
  name?: string | null;
  cuisine_type?: string | null;
  bio?: string | null;
  search_keywords?: string[] | null;
  location?: LocationLike | null;
};

/**
 * Text a customer search query is matched against. Street-level text is only
 * searchable while the truck is LIVE there; otherwise typing an address would
 * reveal which truck an old serving location or home address belongs to.
 */
export const getTruckSearchFields = (truck: TruckSearchLike, options: { openNow: boolean }): string[] => [
  truck.name ?? '',
  truck.cuisine_type ?? '',
  truck.bio ?? '',
  getTruckGeneralLocationLabel(truck) ?? '',
  isRegionDescription(truck.service_area) ? truck.service_area?.trim() ?? '' : '',
  options.openNow ? truck.location?.address ?? '' : '',
  ...(truck.search_keywords ?? []),
].filter(field => field.length > 0);

// ---------------------------------------------------------------------------
// Card location line and navigation availability.
// ---------------------------------------------------------------------------

type UpcomingStopLike = {
  starts_at: string;
  location_text?: string | null;
};

export type TruckCardLocation =
  | { kind: 'live'; text: string }
  | { kind: 'upcoming'; startsAt: string; locationText: string | null }
  | { kind: 'none' };

/**
 * What a truck card shows under its name:
 * - LIVE: the actual serving location.
 * - Offline with an upcoming stop: that stop, labeled as a future stop.
 * - Otherwise nothing location-specific (never the last serving address).
 */
export const getTruckCardLocation = (
  truck: TruckLocationLike,
  options: { openNow: boolean; nextStop?: UpcomingStopLike | null }
): TruckCardLocation => {
  if (options.openNow) {
    return { kind: 'live', text: getTruckDisplayLocation(truck) };
  }
  if (options.nextStop) {
    return {
      kind: 'upcoming',
      startsAt: options.nextStop.starts_at,
      locationText: options.nextStop.location_text?.trim() || null,
    };
  }
  return { kind: 'none' };
};

export type TruckNavigationState = 'navigate' | 'not_serving' | 'unavailable';

/**
 * Whether the truck profile's main Navigate button may open directions.
 * Customers can only navigate to a truck that is LIVE now; a closed truck's
 * coordinates are its last serving spot, not where it is.
 *
 * Closed is checked before coordinates: a closed truck always reads
 * "Not Serving Now", whether or not its stored location is readable (it will
 * not be once public reads of offline trucks' locations are restricted).
 */
export const getTruckNavigationState = (options: {
  isCustomerView: boolean;
  openNow: boolean;
  hasCoordinates: boolean;
}): TruckNavigationState => {
  if (options.isCustomerView && !options.openNow) return 'not_serving';
  if (!options.hasCoordinates) return 'unavailable';
  return 'navigate';
};
