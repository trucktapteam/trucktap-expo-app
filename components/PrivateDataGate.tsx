import React from 'react';
import ClientUpdateRequiredScreen from '@/components/ClientUpdateRequiredScreen';
import { useReleasePolicy, PRIVATE_DATA_SCOPE } from '@/contexts/ReleasePolicyContext';
import { getClientRelease } from '@/lib/clientRelease';
import { getPolicyStoreUrl } from '@/lib/releasePolicyCore';

type PrivateDataGateProps = {
  children: React.ReactNode;
};

// Wraps any private-data-dependent section of a screen (a profile identity
// card, a notification-preferences section, ...). Renders children
// normally when the client is compatible; otherwise renders the shared
// update-required experience in place of that section only, so
// functionality that does not depend on private-data reads (discovery,
// favorites navigation, theme, logout, ...) keeps working around it.
export default function PrivateDataGate({ children }: PrivateDataGateProps) {
  const { policiesByScope, privateDataAccess, refresh } = useReleasePolicy();
  const release = React.useMemo(() => getClientRelease(), []);

  if (privateDataAccess === 'allowed') {
    return <>{children}</>;
  }

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
      variant="inline"
      paused={paused}
      title={title}
      message={message}
      storeUrl={storeUrl}
      onRetry={() => void refresh()}
    />
  );
}
