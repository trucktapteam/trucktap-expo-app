import React from 'react';
import { useRouter } from 'expo-router';
import ClientUpdateRequiredScreen from '@/components/ClientUpdateRequiredScreen';
import { useReleasePolicy, OWNER_MANAGEMENT_SCOPE } from '@/contexts/ReleasePolicyContext';
import { getClientRelease } from '@/lib/clientRelease';
import { getPolicyStoreUrl } from '@/lib/releasePolicyCore';

export default function OwnerUpdateRequiredScreen() {
  const router = useRouter();
  const { policiesByScope, ownerAccess, refresh } = useReleasePolicy();
  const release = React.useMemo(() => getClientRelease(), []);
  const policy = policiesByScope[OWNER_MANAGEMENT_SCOPE];
  const storeUrl = policy ? getPolicyStoreUrl(policy, release.platform) : null;
  const paused = ownerAccess === 'paused';

  const title = paused
    ? 'Truck management is temporarily paused'
    : policy?.updateTitle ?? 'TruckTap has been upgraded!';
  const message = paused
    ? 'TruckTap is temporarily pausing Partner tools. Customers can still browse and find trucks.'
    : policy?.updateMessage ?? 'Please install the latest version to manage your truck.';

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
