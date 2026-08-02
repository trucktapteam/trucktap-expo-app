export const UPCOMING_STOP_IMAGE_BUCKET = 'upcoming-stop-images';
export const UPCOMING_STOP_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const UPCOMING_STOP_IMAGE_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const sanitizeId = (value: string, label: string) => {
  const trimmed = value.trim();
  if (!/^[0-9a-z-]+$/i.test(trimmed)) throw new Error(`Invalid ${label} for event flyer storage.`);
  return trimmed;
};

export const getUpcomingStopImageExtension = (mimeType?: string | null) => {
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  return 'jpg';
};

export const buildUpcomingStopImagePath = (
  truckId: string,
  stopId: string,
  uniquePart: string,
  mimeType?: string | null
) => `${sanitizeId(truckId, 'truck ID')}/${sanitizeId(stopId, 'stop ID')}/${sanitizeId(uniquePart, 'file name')}.${getUpcomingStopImageExtension(mimeType)}`;

export const extractUpcomingStopImagePath = (url?: string | null): string | null => {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${UPCOMING_STOP_IMAGE_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex < 0) return null;
  const encodedPath = url.slice(markerIndex + marker.length).split('?')[0];
  try {
    return decodeURIComponent(encodedPath);
  } catch {
    return encodedPath;
  }
};

export const validateUpcomingStopImageAsset = (asset: {
  fileSize?: number | null;
  mimeType?: string | null;
}) => {
  if (asset.mimeType && !UPCOMING_STOP_IMAGE_ALLOWED_TYPES.includes(asset.mimeType as any)) {
    throw new Error('Choose a JPG, PNG, or WebP image for the event flyer.');
  }
  if (asset.fileSize && asset.fileSize > UPCOMING_STOP_IMAGE_MAX_BYTES) {
    throw new Error('The event flyer must be 8 MB or smaller.');
  }
};
