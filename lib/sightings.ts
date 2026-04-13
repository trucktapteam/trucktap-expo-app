import { Sighting } from '@/types';

export const hasSightingCoordinates = (sighting: Pick<Sighting, 'latitude' | 'longitude'>) =>
  Number.isFinite(sighting.latitude) && Number.isFinite(sighting.longitude);

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
