import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { getOwnerRestrictionFromError, mapOwnerReleasePolicy } from '@/lib/releasePolicyCore';

type RestrictionListener = (restriction: 'update_required' | 'paused') => void;
const listeners = new Set<RestrictionListener>();

export const subscribeToOwnerReleaseRestrictions = (listener: RestrictionListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const emitOwnerReleaseRestriction = (error: unknown): boolean => {
  const restriction = getOwnerRestrictionFromError(
    error as { message?: string | null; details?: string | null },
  );
  if (!restriction || restriction === 'allowed') return false;
  listeners.forEach(listener => listener(restriction));
  return true;
};

export const loadOwnerReleasePolicy = async () => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase.rpc('get_owner_release_policy');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return mapOwnerReleasePolicy(row as Record<string, unknown> | null);
};

export const observeOwnerClientVersion = async () => {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase.rpc('observe_owner_client_version');
  if (error) {
    console.log('[ReleasePolicy] Owner client observation failed:', error.code);
    return false;
  }
  return data === true;
};
