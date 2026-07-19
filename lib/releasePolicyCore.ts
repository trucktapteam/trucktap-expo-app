import type { ClientPlatform } from '@/lib/clientRelease';

export type OwnerReleasePolicy = {
  ownerGateEnabled: boolean;
  ownerManagementPaused: boolean;
  minimumAndroidBuild: number | null;
  minimumIosBuild: number | null;
  androidStoreUrl: string | null;
  iosStoreUrl: string | null;
  updateTitle: string;
  updateMessage: string;
  updatedAt: string | null;
};

export type OwnerAccessStatus = 'allowed' | 'update_required' | 'paused';

export const evaluateOwnerAccess = (
  policy: OwnerReleasePolicy,
  platform: ClientPlatform,
  nativeBuild: number | null,
): OwnerAccessStatus => {
  if (policy.ownerManagementPaused) return 'paused';
  if (!policy.ownerGateEnabled || platform === 'web') return 'allowed';

  const minimum =
    platform === 'android'
      ? policy.minimumAndroidBuild
      : policy.minimumIosBuild;

  if (
    minimum === null ||
    nativeBuild === null ||
    !Number.isSafeInteger(nativeBuild) ||
    nativeBuild < minimum
  ) {
    return 'update_required';
  }

  return 'allowed';
};

export const getPolicyStoreUrl = (
  policy: OwnerReleasePolicy,
  platform: ClientPlatform,
): string | null => {
  if (platform === 'android') return policy.androidStoreUrl;
  if (platform === 'ios') return policy.iosStoreUrl;
  return null;
};

export const mapOwnerReleasePolicy = (
  row: Record<string, unknown> | null | undefined,
): OwnerReleasePolicy => ({
  ownerGateEnabled: row?.owner_gate_enabled === true,
  ownerManagementPaused: row?.owner_management_paused === true,
  minimumAndroidBuild:
    Number.isInteger(row?.minimum_android_build)
      ? Number(row?.minimum_android_build)
      : null,
  minimumIosBuild:
    Number.isInteger(row?.minimum_ios_build)
      ? Number(row?.minimum_ios_build)
      : null,
  androidStoreUrl:
    typeof row?.android_store_url === 'string' ? row.android_store_url : null,
  iosStoreUrl:
    typeof row?.ios_store_url === 'string' ? row.ios_store_url : null,
  updateTitle:
    typeof row?.update_title === 'string' && row.update_title.trim()
      ? row.update_title.trim()
      : 'TruckTap has been upgraded!',
  updateMessage:
    typeof row?.update_message === 'string' && row.update_message.trim()
      ? row.update_message.trim()
      : 'Please install the latest version to manage your truck.',
  updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
});

export const getOwnerRestrictionFromError = (
  error: { message?: string | null; details?: string | null } | null | undefined,
): OwnerAccessStatus | null => {
  const detail = error?.details?.toLowerCase() ?? '';
  const message = error?.message?.toLowerCase() ?? '';
  if (
    detail.includes('owner_management_paused') ||
    message.includes('trucktap_owner_management_paused')
  ) {
    return 'paused';
  }
  if (
    detail.includes('owner_update_required') ||
    message.includes('trucktap_owner_update_required')
  ) {
    return 'update_required';
  }
  return null;
};
