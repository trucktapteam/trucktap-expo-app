import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import {
  computeUploadResizeTarget,
  IMAGE_UPLOAD_PRESETS,
  type ImageUploadPresetName,
} from '@/lib/imageUploadCore';

export * from '@/lib/imageUploadCore';

/**
 * Resizes (if needed) and re-encodes a locally-picked image before it's
 * uploaded to Supabase Storage, using one of IMAGE_UPLOAD_PRESETS. Pass the
 * `width`/`height` ImagePicker already returns on the picked asset — when
 * present, the image is only resized if it's actually bigger than the
 * preset's cap, so a photo that's already small isn't upscaled or
 * needlessly re-compressed twice as hard. When dimensions aren't known
 * (e.g. a URI with no picker metadata), the image is left at its native
 * size and only re-encoded at the preset's quality.
 *
 * Always re-encodes to JPEG: every upload call site already labels its
 * Supabase object `contentType: 'image/jpeg'` regardless of source format,
 * so this makes the actual bytes match that label instead of silently
 * uploading a PNG/HEIC under a JPEG content-type.
 */
export async function prepareImageForUpload(
  uri: string,
  presetName: ImageUploadPresetName,
  sourceDimensions?: { width?: number | null; height?: number | null }
): Promise<string> {
  const preset = IMAGE_UPLOAD_PRESETS[presetName];
  const resizeTarget = computeUploadResizeTarget(
    sourceDimensions?.width,
    sourceDimensions?.height,
    preset.maxDimension
  );

  const context = ImageManipulator.manipulate(uri);
  if (resizeTarget) context.resize(resizeTarget);
  const rendered = await context.renderAsync();
  const result = await rendered.saveAsync({
    compress: preset.quality,
    format: SaveFormat.JPEG,
  });

  return result.uri;
}
