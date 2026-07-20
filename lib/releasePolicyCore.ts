import type { ClientPlatform } from '@/lib/clientRelease';

export type ClientAccessStatus = 'allowed' | 'update_required' | 'paused';
export type ClientRestriction = 'update_required' | 'paused';

export type CompatibilityPolicy = {
  scope: string;
  enabled: boolean;
  paused: boolean;
  minimumAndroidBuild: number | null;
  minimumIosBuild: number | null;
  androidStoreUrl: string | null;
  iosStoreUrl: string | null;
  updateTitle: string;
  updateMessage: string;
  updatedAt: string | null;
};

export type ScopedRestriction = { scope: string; restriction: ClientRestriction };

// The legacy owner_management scope predates this generalized module and
// emits two literal, irregular error strings ('owner_update_required' /
// 'owner_management_paused') that already-installed owner clients parse.
// Every other scope uses the regular `${scope}_paused` / `${scope}_update_required`
// pattern the server derives directly from the scope name.
const LEGACY_OWNER_SCOPE = 'owner_management';

export const KNOWN_CLIENT_SCOPES = [LEGACY_OWNER_SCOPE, 'private_data'] as const;

export const evaluateClientAccess = (
  policy: Pick<CompatibilityPolicy, 'enabled' | 'paused' | 'minimumAndroidBuild' | 'minimumIosBuild'>,
  platform: ClientPlatform,
  nativeBuild: number | null,
): ClientAccessStatus => {
  if (policy.paused) return 'paused';
  if (!policy.enabled || platform === 'web') return 'allowed';

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
  policy: Pick<CompatibilityPolicy, 'androidStoreUrl' | 'iosStoreUrl'>,
  platform: ClientPlatform,
): string | null => {
  if (platform === 'android') return policy.androidStoreUrl;
  if (platform === 'ios') return policy.iosStoreUrl;
  return null;
};

export const mapCompatibilityPolicy = (
  scope: string,
  row: Record<string, unknown> | null | undefined,
): CompatibilityPolicy => ({
  scope,
  enabled: row?.enabled === true,
  paused: row?.paused === true,
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
      : 'Please install the latest version to continue.',
  updatedAt: typeof row?.updated_at === 'string' ? row.updated_at : null,
});

const matchesScope = (
  scope: string,
  detail: string,
  message: string,
): ClientRestriction | null => {
  if (scope === LEGACY_OWNER_SCOPE) {
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
  }

  if (
    detail.includes(`${scope}_paused`) ||
    message.includes(`trucktap_${scope}_paused`)
  ) {
    return 'paused';
  }
  if (
    detail.includes(`${scope}_update_required`) ||
    message.includes(`trucktap_${scope}_update_required`)
  ) {
    return 'update_required';
  }
  return null;
};

// Single source of truth for turning a Supabase/Postgres error into a
// (scope, restriction) pair. Every protected RPC's rejection is recognized
// here once, regardless of how many scopes exist.
export const parseClientRestrictionFromError = (
  error: { message?: string | null; details?: string | null } | null | undefined,
  scopes: readonly string[] = KNOWN_CLIENT_SCOPES,
): ScopedRestriction | null => {
  const detail = error?.details?.toLowerCase() ?? '';
  const message = error?.message?.toLowerCase() ?? '';
  if (!detail && !message) return null;

  for (const scope of scopes) {
    const restriction = matchesScope(scope, detail, message);
    if (restriction) return { scope, restriction };
  }
  return null;
};

// --- Backward-compatible owner_management-specific API -------------------
// Preserved verbatim (names, shapes, and behavior) so existing callers and
// tests need no changes. Each is a thin wrapper over the generalized
// functions above.

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

export type OwnerAccessStatus = ClientAccessStatus;

export const evaluateOwnerAccess = (
  policy: OwnerReleasePolicy,
  platform: ClientPlatform,
  nativeBuild: number | null,
): OwnerAccessStatus =>
  evaluateClientAccess(
    {
      enabled: policy.ownerGateEnabled,
      paused: policy.ownerManagementPaused,
      minimumAndroidBuild: policy.minimumAndroidBuild,
      minimumIosBuild: policy.minimumIosBuild,
    },
    platform,
    nativeBuild,
  );

export const mapOwnerReleasePolicy = (
  row: Record<string, unknown> | null | undefined,
): OwnerReleasePolicy => {
  const mapped = mapCompatibilityPolicy(LEGACY_OWNER_SCOPE, {
    enabled: row?.owner_gate_enabled,
    paused: row?.owner_management_paused,
    minimum_android_build: row?.minimum_android_build,
    minimum_ios_build: row?.minimum_ios_build,
    android_store_url: row?.android_store_url,
    ios_store_url: row?.ios_store_url,
    update_title: row?.update_title,
    update_message: row?.update_message,
    updated_at: row?.updated_at,
  });

  return {
    ownerGateEnabled: mapped.enabled,
    ownerManagementPaused: mapped.paused,
    minimumAndroidBuild: mapped.minimumAndroidBuild,
    minimumIosBuild: mapped.minimumIosBuild,
    androidStoreUrl: mapped.androidStoreUrl,
    iosStoreUrl: mapped.iosStoreUrl,
    updateTitle: mapped.updateTitle,
    updateMessage: mapped.updateMessage,
    updatedAt: mapped.updatedAt,
  };
};

export const getOwnerRestrictionFromError = (
  error: { message?: string | null; details?: string | null } | null | undefined,
): OwnerAccessStatus | null => {
  const result = parseClientRestrictionFromError(error, [LEGACY_OWNER_SCOPE]);
  return result ? result.restriction : null;
};
