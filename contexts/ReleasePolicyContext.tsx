import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getClientRelease } from '@/lib/clientRelease';
import {
  ClientAccessStatus,
  CompatibilityPolicy,
  evaluateClientAccess,
} from '@/lib/releasePolicyCore';
import {
  loadClientCompatibilityPolicies,
  observeOwnerClientVersion,
  subscribeToClientRestrictions,
} from '@/lib/releasePolicy';

// Scope keys, exported so screens can address a specific scope without
// hardcoding the string themselves.
export const OWNER_MANAGEMENT_SCOPE = 'owner_management';
export const PRIVATE_DATA_SCOPE = 'private_data';

type ReleasePolicyContextValue = {
  policiesByScope: Record<string, CompatibilityPolicy>;
  accessByScope: Record<string, ClientAccessStatus>;
  /** Convenience alias for accessByScope[OWNER_MANAGEMENT_SCOPE]. */
  ownerAccess: ClientAccessStatus;
  /** Convenience alias for accessByScope[PRIVATE_DATA_SCOPE]. */
  privateDataAccess: ClientAccessStatus;
  loading: boolean;
  refresh: () => Promise<void>;
};

const defaultContextValue: ReleasePolicyContextValue = {
  policiesByScope: {},
  accessByScope: {},
  ownerAccess: 'allowed',
  privateDataAccess: 'allowed',
  loading: true,
  refresh: async () => undefined,
};

const ReleasePolicyContext = React.createContext<ReleasePolicyContextValue>(
  defaultContextValue,
);

export function ReleasePolicyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [policiesByScope, setPoliciesByScope] = React.useState<
    Record<string, CompatibilityPolicy>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [serverRestrictions, setServerRestrictions] = React.useState<
    Record<string, 'update_required' | 'paused' | undefined>
  >({});
  const release = React.useMemo(() => getClientRelease(), []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const policies = await loadClientCompatibilityPolicies();
      if (Object.keys(policies).length > 0) {
        setPoliciesByScope(policies);
      }
      setServerRestrictions({});
    } catch (error) {
      // Browsing and startup fail open. Sensitive mutations/reads remain
      // protected by the authoritative database policy regardless of
      // whether this client-side evaluation ever runs.
      console.log('[ReleasePolicy] Policy refresh unavailable:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(
    () =>
      subscribeToClientRestrictions((scope, restriction) => {
        setServerRestrictions(prev => ({ ...prev, [scope]: restriction }));
      }),
    [],
  );

  React.useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    void observeOwnerClientVersion();
  }, [authLoading, isAuthenticated]);

  const accessByScope = React.useMemo(() => {
    const result: Record<string, ClientAccessStatus> = {};
    for (const [scope, policy] of Object.entries(policiesByScope)) {
      const evaluated = evaluateClientAccess(policy, release.platform, release.nativeBuild);
      const serverRestriction = serverRestrictions[scope];
      result[scope] =
        serverRestriction === 'paused' || evaluated === 'paused'
          ? 'paused'
          : serverRestriction === 'update_required'
            ? 'update_required'
            : evaluated;
    }
    return result;
  }, [policiesByScope, release.platform, release.nativeBuild, serverRestrictions]);

  const value: ReleasePolicyContextValue = {
    policiesByScope,
    accessByScope,
    ownerAccess: accessByScope[OWNER_MANAGEMENT_SCOPE] ?? 'allowed',
    privateDataAccess: accessByScope[PRIVATE_DATA_SCOPE] ?? 'allowed',
    loading,
    refresh,
  };

  return (
    <ReleasePolicyContext.Provider value={value}>
      {children}
    </ReleasePolicyContext.Provider>
  );
}

export const useReleasePolicy = () => React.useContext(ReleasePolicyContext);
