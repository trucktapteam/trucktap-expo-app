import React from 'react';
import { useRouter } from 'expo-router';
import ClientUpdateRequiredScreen from '@/components/ClientUpdateRequiredScreen';
import { useReleasePolicy, PRIVATE_DATA_SCOPE } from '@/contexts/ReleasePolicyContext';
import { getClientRelease } from '@/lib/clientRelease';
import { getPolicyStoreUrl } from '@/lib/releasePolicyCore';

// Full-screen counterpart to PrivateDataGate's inline rendering, for
// contexts that navigate to a dedicated route rather than embedding the
// gate inline (e.g. a future deep link straight into a protected screen).
export default function PrivateDataUpdateRequiredScreen() {
  const router = useRouter();
  const { policiesByScope, privateDataAccess, refresh } = useReleasePolicy();
  const release = React.useMemo(() => getClientRelease(), []);
  const policy = policiesByScope[PRIVATE_DATA_SCOPE];
  const storeUrl = policy ? getPolicyStoreUrl(policy, release.platform) : null;
  const paused = privateDataAccess === 'paused';

  const title = paused
    ? 'Account features are temporarily paused'
    : policy?.updateTitle ?? 'TruckTap has been upgraded!';
  const message = paused
    ? 'TruckTap is temporarily pausing account and profile features. Discovery and favorites are unaffected.'
    : policy?.updateMessage ?? 'Please install the latest version to view your profile and account settings.';

  return (
    <ClientUpdateRequiredScreen
      paused={paused}
      title={title}
      message={message}
      storeUrl={storeUrl}
      onRetry={() => void refresh()}
      onBrowseTrucks={() => router.replace('/(customer)/(tabs)/discover' as any)}
    />
  );
}
