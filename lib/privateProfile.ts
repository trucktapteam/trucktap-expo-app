import { supabase } from '@/lib/supabase';

export type PrivateProfileRow = {
  display_name: string | null;
  profile_photo: string | null;
  role: string | null;
  truck_id: string | null;
  notify_favorites_open: boolean;
  notify_new_trucks: boolean;
  notify_announcements: boolean;
  notify_owner_favorites: boolean | null;
  notify_owner_reviews: boolean | null;
};

const LEGACY_PRIVATE_PROFILE_SELECT =
  'display_name, profile_photo, role, truck_id, notify_favorites_open, notify_new_trucks, notify_announcements, notify_owner_favorites, notify_owner_reviews';

const isMissingPrivateProfileRpc = (error: { code?: string; message?: string } | null): boolean =>
  error?.code === 'PGRST202'
  || (
    error?.code === '42883'
    && error.message?.toLowerCase().includes('get_private_profile') === true
  );

export const fetchPrivateProfile = async (profileId: string) => {
  const rpcResult = await supabase
    .rpc('get_private_profile', { p_profile_id: profileId })
    .single<PrivateProfileRow>();

  if (!isMissingPrivateProfileRpc(rpcResult.error)) {
    return rpcResult;
  }

  // Compatibility with the current production schema before the privacy
  // migration exists. Once the RPC is present, authorization failures never
  // fall back to direct table access.
  return supabase
    .from('profiles')
    .select(LEGACY_PRIVATE_PROFILE_SELECT)
    .eq('id', profileId)
    .single<PrivateProfileRow>();
};
