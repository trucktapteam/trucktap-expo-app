import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  CompatibilityPolicy,
  ClientRestriction,
  KNOWN_CLIENT_SCOPES,
  mapCompatibilityPolicy,
  parseClientRestrictionFromError,
} from '@/lib/releasePolicyCore';

type RestrictionListener = (scope: string, restriction: ClientRestriction) => void;
const listeners = new Set<RestrictionListener>();

export const subscribeToClientRestrictions = (listener: RestrictionListener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Single emission path for every scope. A caller does not need to know
// which scope an RPC belongs to — the server-controlled error string
// already carries that, matched here once.
export const emitClientRestriction = (error: unknown): boolean => {
  const result = parseClientRestrictionFromError(
    error as { message?: string | null; details?: string | null },
    KNOWN_CLIENT_SCOPES,
  );
  if (!result) return false;
  listeners.forEach(listener => listener(result.scope, result.restriction));
  return true;
};

// Preserved name for existing call sites (AppContext owner-write RPCs,
// handsFreeLive.ts). Behavior is unchanged; it now also recognizes other
// scopes' errors, which is harmless for owner-only call sites since those
// only ever produce owner_management errors.
export const emitOwnerReleaseRestriction = emitClientRestriction;

export const loadClientCompatibilityPolicies = async (): Promise<
  Record<string, CompatibilityPolicy>
> => {
  if (!isSupabaseConfigured) return {};
  const { data, error } = await supabase.rpc('get_client_compatibility_policies');
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const policies: Record<string, CompatibilityPolicy> = {};
  for (const row of rows as Record<string, unknown>[]) {
    const scope = typeof row?.scope === 'string' ? row.scope : null;
    if (!scope) continue;
    policies[scope] = mapCompatibilityPolicy(scope, row);
  }
  return policies;
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
