import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { getClientRelease } from '@/lib/clientRelease';
import {
  OwnerAccessStatus,
  OwnerReleasePolicy,
  evaluateOwnerAccess,
  mapOwnerReleasePolicy,
} from '@/lib/releasePolicyCore';
import {
  loadOwnerReleasePolicy,
  observeOwnerClientVersion,
  subscribeToOwnerReleaseRestrictions,
} from '@/lib/releasePolicy';

type ReleasePolicyContextValue = {
  policy: OwnerReleasePolicy;
  ownerAccess: OwnerAccessStatus;
  loading: boolean;
  refresh: () => Promise<void>;
};

const defaultPolicy = mapOwnerReleasePolicy(null);
const ReleasePolicyContext = React.createContext<ReleasePolicyContextValue>({
  policy: defaultPolicy,
  ownerAccess: 'allowed',
  loading: true,
  refresh: async () => undefined,
});

export function ReleasePolicyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [policy, setPolicy] = React.useState(defaultPolicy);
  const [loading, setLoading] = React.useState(true);
  const [serverRestriction, setServerRestriction] =
    React.useState<OwnerAccessStatus | null>(null);
  const release = React.useMemo(() => getClientRelease(), []);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const nextPolicy = await loadOwnerReleasePolicy();
      if (nextPolicy) setPolicy(nextPolicy);
      setServerRestriction(null);
    } catch (error) {
      // Browsing and startup fail open. Sensitive mutations remain protected
      // by the authoritative database policy.
      console.log('[ReleasePolicy] Policy refresh unavailable:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  React.useEffect(
    () => subscribeToOwnerReleaseRestrictions(setServerRestriction),
    [],
  );

  React.useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    void observeOwnerClientVersion();
  }, [authLoading, isAuthenticated]);

  const evaluated = evaluateOwnerAccess(
    policy,
    release.platform,
    release.nativeBuild,
  );
  const ownerAccess =
    serverRestriction === 'paused' || evaluated === 'paused'
      ? 'paused'
      : serverRestriction === 'update_required'
        ? 'update_required'
        : evaluated;

  return (
    <ReleasePolicyContext.Provider
      value={{ policy, ownerAccess, loading, refresh }}
    >
      {children}
    </ReleasePolicyContext.Provider>
  );
}

export const useReleasePolicy = () => React.useContext(ReleasePolicyContext);
