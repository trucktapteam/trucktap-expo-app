export type ImageUploadPreset = {
  /** Cap on the longer side of the image, in pixels, before upload. */
  maxDimension: number;
  /** JPEG re-encode quality, 0-1. */
  quality: number;
};

/**
 * One preset per upload surface. Values are chosen so the on-disk image
 * stays comfortably above what any current display size in the app or web
 * profile actually renders (see PlaceholderImage/gallery/menu usages),
 * while cutting multi-megabyte camera photos and 1080x1920 poster captures
 * down to a few hundred KB. Menu boards and event flyers get a higher cap
 * and/or quality than plain photos because they carry text that needs to
 * stay legible.
 */
export const IMAGE_UPLOAD_PRESETS = {
  gallery: { maxDimension: 1600, quality: 0.8 },
  hero: { maxDimension: 1600, quality: 0.82 },
  logo: { maxDimension: 1000, quality: 0.85 },
  menuItem: { maxDimension: 1200, quality: 0.8 },
  menuBoard: { maxDimension: 1800, quality: 0.85 },
  eventFlyer: { maxDimension: 1600, quality: 0.88 },
  sighting: { maxDimension: 1600, quality: 0.8 },
  profilePhoto: { maxDimension: 1000, quality: 0.85 },
} as const satisfies Record<string, ImageUploadPreset>;

export type ImageUploadPresetName = keyof typeof IMAGE_UPLOAD_PRESETS;

/**
 * Computes the resize target for an image manipulator's `resize` action so
 * the longer side is capped at `maxDimension`, preserving aspect ratio.
 * Returns null when the source dimensions are unknown or already within
 * the cap — re-encoding an image that isn't actually oversized would only
 * cost quality for no size benefit, so callers should skip the resize step
 * entirely in that case rather than resize-to-same-size.
 */
export const computeUploadResizeTarget = (
  sourceWidth: number | null | undefined,
  sourceHeight: number | null | undefined,
  maxDimension: number
): { width: number; height: number } | null => {
  if (!sourceWidth || !sourceHeight || sourceWidth <= 0 || sourceHeight <= 0) return null;
  const longSide = Math.max(sourceWidth, sourceHeight);
  if (longSide <= maxDimension) return null;

  const scale = maxDimension / longSide;
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
};
