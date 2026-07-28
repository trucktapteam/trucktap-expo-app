import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { emitOwnerReleaseRestriction } from '@/lib/releasePolicy';

export type HandsFreeLiveOwnerSettings = {
  supported: boolean;
  systemEnabled: boolean;
  startGraceMinutes: number;
  endGraceMinutes: number;
  confirmationNotificationsEnabled: boolean;
};

export type UpcomingStopAutomationStatus = {
  stopId: string;
  enabled: boolean;
  statusCode: string;
  statusLabel: string;
  statusDetail: string;
  autoStartResolvedAt: string | null;
  autoLiveStartedAt: string | null;
  autoEndResolvedAt: string | null;
};

type RpcError = {
  code?: string | null;
  message?: string | null;
};

const DEFAULT_SETTINGS: HandsFreeLiveOwnerSettings = {
  supported: false,
  systemEnabled: false,
  startGraceMinutes: 15,
  endGraceMinutes: 5,
  confirmationNotificationsEnabled: true,
};

export const isHandsFreeLiveRpcUnavailable = (error: RpcError | null | undefined) => {
  const message = error?.message?.toLowerCase() ?? '';
  return (
    error?.code === 'PGRST202' ||
    error?.code === '42883' ||
    message.includes('could not find the function') ||
    (message.includes('function') && message.includes('does not exist'))
  );
};

export const mapHandsFreeLiveOwnerSettings = (
  row: Record<string, unknown> | null | undefined
): HandsFreeLiveOwnerSettings => {
  if (!row) return DEFAULT_SETTINGS;

  const startGraceMinutes = Number(row.start_grace_minutes);
  const endGraceMinutes = Number(row.end_grace_minutes);

  return {
    supported: true,
    systemEnabled: row.system_enabled === true,
    startGraceMinutes: Number.isFinite(startGraceMinutes) ? startGraceMinutes : 15,
    endGraceMinutes: Number.isFinite(endGraceMinutes) ? endGraceMinutes : 5,
    confirmationNotificationsEnabled:
      row.confirmation_notifications_enabled !== false,
  };
};

export const mapUpcomingStopAutomationStatus = (
  row: Record<string, unknown>
): UpcomingStopAutomationStatus => ({
  stopId: String(row.stop_id ?? ''),
  enabled: row.enabled === true,
  statusCode: typeof row.status_code === 'string' ? row.status_code : 'off',
  statusLabel: typeof row.status_label === 'string' ? row.status_label : 'Off',
  statusDetail:
    typeof row.status_detail === 'string'
      ? row.status_detail
      : 'Hands-Free LIVE is off for this stop.',
  autoStartResolvedAt:
    typeof row.auto_start_resolved_at === 'string'
      ? row.auto_start_resolved_at
      : null,
  autoLiveStartedAt:
    typeof row.auto_live_started_at === 'string'
      ? row.auto_live_started_at
      : null,
  autoEndResolvedAt:
    typeof row.auto_end_resolved_at === 'string'
      ? row.auto_end_resolved_at
      : null,
});

export const loadHandsFreeLiveOwnerState = async (truckId: string) => {
  if (!isSupabaseConfigured) {
    return {
      settings: DEFAULT_SETTINGS,
      statuses: [] as UpcomingStopAutomationStatus[],
    };
  }

  const [settingsResult, statusesResult] = await Promise.all([
    supabase.rpc('get_hands_free_live_owner_settings', {
      p_truck_id: truckId,
    }),
    supabase.rpc('get_upcoming_stop_automation_statuses', {
      p_truck_id: truckId,
    }),
  ]);

  const unavailableError = settingsResult.error ?? statusesResult.error;
  if (unavailableError && isHandsFreeLiveRpcUnavailable(unavailableError)) {
    return {
      settings: DEFAULT_SETTINGS,
      statuses: [] as UpcomingStopAutomationStatus[],
    };
  }

  if (settingsResult.error) {
    throw new Error(`Could not load Hands-Free LIVE settings: ${settingsResult.error.message}`);
  }
  if (statusesResult.error) {
    throw new Error(`Could not load Hands-Free LIVE statuses: ${statusesResult.error.message}`);
  }

  const settingsRow = Array.isArray(settingsResult.data)
    ? settingsResult.data[0]
    : settingsResult.data;
  const statusRows = Array.isArray(statusesResult.data)
    ? statusesResult.data
    : [];

  return {
    settings: mapHandsFreeLiveOwnerSettings(settingsRow as Record<string, unknown> | null),
    statuses: statusRows
      .map(row => mapUpcomingStopAutomationStatus(row as Record<string, unknown>))
      .filter(status => status.stopId.length > 0),
  };
};

export const configureUpcomingStopAutomation = async (input: {
  stopId: string;
  enabled: boolean;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
}) => {
  const { error } = await supabase.rpc('configure_upcoming_stop_live_automation', {
    p_stop_id: input.stopId,
    p_enabled: input.enabled,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_timezone: input.timezone ?? null,
  });

  if (error) {
    emitOwnerReleaseRestriction(error);
    throw new Error(error.message);
  }
};

export type UpcomingStopLocationStatus = {
  stopId: string;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  geocodeAttemptedAt: string | null;
  geocodeFailedAt: string | null;
};

export const mapUpcomingStopLocationStatus = (
  row: Record<string, unknown>
): UpcomingStopLocationStatus => ({
  stopId: String(row.stop_id ?? ''),
  latitude: typeof row.latitude === 'number' ? row.latitude : null,
  longitude: typeof row.longitude === 'number' ? row.longitude : null,
  timezone: typeof row.timezone === 'string' ? row.timezone : null,
  geocodeAttemptedAt:
    typeof row.location_geocode_attempted_at === 'string'
      ? row.location_geocode_attempted_at
      : null,
  geocodeFailedAt:
    typeof row.location_geocode_failed_at === 'string'
      ? row.location_geocode_failed_at
      : null,
});

export const loadUpcomingStopLocationStatuses = async (
  truckId: string
): Promise<UpcomingStopLocationStatus[]> => {
  if (!isSupabaseConfigured) {
    return [];
  }

  const { data, error } = await supabase.rpc('get_upcoming_stop_location_statuses', {
    p_truck_id: truckId,
  });

  if (error) {
    if (isHandsFreeLiveRpcUnavailable(error)) {
      return [];
    }
    throw new Error(`Could not load stop location status: ${error.message}`);
  }

  const rows = Array.isArray(data) ? data : [];
  return rows
    .map(row => mapUpcomingStopLocationStatus(row as Record<string, unknown>))
    .filter(status => status.stopId.length > 0);
};

export const setUpcomingStopLocation = async (input: {
  stopId: string;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string | null;
  failed?: boolean;
}) => {
  const { error } = await supabase.rpc('set_upcoming_stop_location', {
    p_stop_id: input.stopId,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_timezone: input.timezone ?? null,
    p_failed: input.failed ?? false,
  });

  if (error) {
    throw new Error(error.message);
  }
};

export const setHandsFreeLiveConfirmationNotifications = async (
  enabled: boolean
) => {
  const { error } = await supabase.rpc(
    'set_hands_free_live_confirmation_notifications',
    { p_enabled: enabled }
  );

  if (error) {
    emitOwnerReleaseRestriction(error);
    throw new Error(error.message);
  }
};
