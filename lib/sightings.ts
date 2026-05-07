import { Sighting } from '@/types';

const COMMUNITY_SPOTTER_NAME = 'Community Spotter';

export const hasSightingCoordinates = (sighting: Pick<Sighting, 'latitude' | 'longitude'>) =>
  Number.isFinite(sighting.latitude) && Number.isFinite(sighting.longitude);

export const getSafeSpotterDisplayName = (name?: string | null) => {
  const trimmed = name?.trim();

  if (!trimmed || trimmed.includes('@')) {
    return COMMUNITY_SPOTTER_NAME;
  }

  return trimmed.slice(0, 40);
};

export const formatSightingSpotter = (sighting?: Pick<Sighting, 'spotted_by_name'> | null) =>
  `👀 Spotted by ${getSafeSpotterDisplayName(sighting?.spotted_by_name)}`;

export const addSpotterNamesToSightings = async (
  supabaseClient: any,
  sightings: Sighting[]
): Promise<Sighting[]> => {
  const userIds = Array.from(
    new Set(
      sightings
        .map((sighting) => sighting.user_id)
        .filter((userId): userId is string => typeof userId === 'string' && userId.length > 0)
    )
  );

  if (userIds.length === 0) {
    return sightings;
  }

  const { data, error } = await supabaseClient
    .from('profiles')
    .select('id, display_name')
    .in('id', userIds);

  if (error) {
    console.log('[Sightings] Failed to load spotter profiles:', error.message);
    return sightings;
  }

  const namesById = new Map<string, string>();
  for (const profile of data ?? []) {
    if (profile?.id) {
      namesById.set(profile.id, getSafeSpotterDisplayName(profile.display_name));
    }
  }

  return sightings.map((sighting) => ({
    ...sighting,
    spotted_by_name: sighting.user_id ? namesById.get(sighting.user_id) ?? null : null,
  }));
};

export const formatSightingLastSeen = (createdAt?: string | null) => {
  if (!createdAt) return 'Last seen just now';

  const timestamp = new Date(createdAt).getTime();
  if (Number.isNaN(timestamp)) return 'Last seen just now';

  const diffMins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Last seen just now';
  if (diffMins < 60) return `Last seen ${diffMins} min ago`;
  if (diffHours < 24) return `Last seen ${diffHours} hr ago`;
  return `Last seen ${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
};
