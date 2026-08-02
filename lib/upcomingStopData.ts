import type { UpcomingStop, UpcomingStopStatus } from '@/types';

const UPCOMING_STOP_STATUSES: UpcomingStopStatus[] = [
  'scheduled',
  'delayed',
  'cancelled',
  'sold_out',
  'completed',
];

export const UPCOMING_STOP_PUBLIC_COLUMNS =
  'id, truck_id, starts_at, ends_at, location_text, note, status, event_image_url, created_at, updated_at';

export const normalizeUpcomingStopStatus = (status: unknown): UpcomingStopStatus =>
  UPCOMING_STOP_STATUSES.includes(status as UpcomingStopStatus)
    ? status as UpcomingStopStatus
    : 'scheduled';

export const mapUpcomingStopRow = (row: any): UpcomingStop => ({
  id: row.id?.toString?.() ?? '',
  truck_id: row.truck_id?.toString?.() ?? '',
  starts_at: row.starts_at ?? new Date().toISOString(),
  ends_at: row.ends_at ?? new Date().toISOString(),
  location_text: row.location_text ?? '',
  note: row.note ?? null,
  status: normalizeUpcomingStopStatus(row.status),
  event_image_url:
    typeof row.event_image_url === 'string' && row.event_image_url.trim().length > 0
      ? row.event_image_url.trim()
      : null,
  created_at: row.created_at ?? undefined,
  updated_at: row.updated_at ?? undefined,
});

export const getUpcomingStopImageUpdate = (eventImageUrl: string | null) => ({
  event_image_url: eventImageUrl?.trim() || null,
});
