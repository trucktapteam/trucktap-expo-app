import { supabase } from '@/lib/supabase';
import {
  buildUpcomingStopImagePath,
  extractUpcomingStopImagePath,
  UPCOMING_STOP_IMAGE_ALLOWED_TYPES,
  UPCOMING_STOP_IMAGE_BUCKET,
  UPCOMING_STOP_IMAGE_MAX_BYTES,
} from '@/lib/upcomingStopImageCore';

export * from '@/lib/upcomingStopImageCore';

export const uploadUpcomingStopImage = async (input: {
  uri: string;
  truckId: string;
  stopId: string;
  mimeType?: string | null;
}) => {
  const response = await fetch(input.uri);
  const body = await response.arrayBuffer();
  if (body.byteLength > UPCOMING_STOP_IMAGE_MAX_BYTES) {
    throw new Error('The event flyer must be 8 MB or smaller.');
  }

  const mimeType = UPCOMING_STOP_IMAGE_ALLOWED_TYPES.includes(input.mimeType as any)
    ? input.mimeType!
    : 'image/jpeg';
  const path = buildUpcomingStopImagePath(
    input.truckId,
    input.stopId,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    mimeType
  );
  const { error } = await supabase.storage
    .from(UPCOMING_STOP_IMAGE_BUCKET)
    .upload(path, body, { contentType: mimeType, upsert: false });

  if (error) throw new Error(`Could not upload event flyer: ${error.message}`);
  return supabase.storage.from(UPCOMING_STOP_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
};

export const removeUpcomingStopImage = async (url?: string | null) => {
  const path = extractUpcomingStopImagePath(url);
  if (!path) return;

  const { error } = await supabase.storage.from(UPCOMING_STOP_IMAGE_BUCKET).remove([path]);
  if (error) throw new Error(`Could not remove event flyer: ${error.message}`);
};
