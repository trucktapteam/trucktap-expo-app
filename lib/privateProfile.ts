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

// get_private_profile() is confirmed deployed in production, and current
// profiles grants (id, display_name, profile_photo only for
// anon/authenticated) intentionally prevent a direct table select from ever
// succeeding for the columns this type needs. There is no working fallback
// path, so any RPC error is returned as-is for the caller to handle.
export const fetchPrivateProfile = async (profileId: string) =>
  supabase
    .rpc('get_private_profile', { p_profile_id: profileId })
    .single<PrivateProfileRow>();
