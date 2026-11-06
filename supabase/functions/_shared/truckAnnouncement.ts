// Pure helpers for notify-truck-announcement. No network or runtime-specific
// imports, so the same code runs in Deno (deployed) and Node (unit tests).

export const ANNOUNCEMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// The announcement timestamp is written by the owner's device, so allow for
// ordinary clock skew while still refusing to re-push an old announcement.
export const ANNOUNCEMENT_MAX_AGE_MS = 60 * 60 * 1000;
export const ANNOUNCEMENT_MAX_FUTURE_SKEW_MS = 60 * 60 * 1000;
export const MAX_ANNOUNCEMENT_MESSAGE_LENGTH = 500;
export const EXPO_PUSH_BATCH_SIZE = 100;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AnnouncementRequest = { truckId: string; message: string };

export type StoredAnnouncement = {
  id?: unknown;
  message?: unknown;
  timestamp?: unknown;
  expires_at?: unknown;
};

export const parseAnnouncementRequest = (
  payload: unknown,
): AnnouncementRequest | null => {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as Record<string, unknown>;
  const truckId = typeof record.truckId === "string" ? record.truckId.trim() : "";
  const message = typeof record.message === "string" ? record.message.trim() : "";
  if (!UUID_PATTERN.test(truckId)) return null;
  if (!message || message.length > MAX_ANNOUNCEMENT_MESSAGE_LENGTH) return null;
  return { truckId, message };
};

const parseTime = (value: unknown): number =>
  typeof value === "string" ? Date.parse(value) : Number.NaN;

const getExpiresAt = (announcement: StoredAnnouncement): number => {
  const explicit = parseTime(announcement.expires_at);
  if (Number.isFinite(explicit)) return explicit;
  const createdAt = parseTime(announcement.timestamp);
  return Number.isFinite(createdAt) ? createdAt + ANNOUNCEMENT_TTL_MS : 0;
};

/**
 * The function only pushes text the owner has already published on the truck
 * (trucks.announcements, written by the app immediately before it invokes the
 * function). The message must match the truck's newest unexpired
 * announcement, and that announcement must be recent. This blocks arbitrary
 * caller-supplied text, re-pushing deleted or older announcements, and
 * replaying an announcement after the freshness window.
 */
export const findDeliverableAnnouncement = (
  storedAnnouncements: unknown,
  message: string,
  now: number,
): StoredAnnouncement | null => {
  if (!Array.isArray(storedAnnouncements)) return null;

  const active = storedAnnouncements.filter(
    (item): item is StoredAnnouncement =>
      !!item &&
      typeof item === "object" &&
      typeof (item as StoredAnnouncement).message === "string" &&
      Number.isFinite(parseTime((item as StoredAnnouncement).timestamp)) &&
      getExpiresAt(item as StoredAnnouncement) > now,
  );
  if (active.length === 0) return null;

  const createdAt = Math.max(...active.map((item) => parseTime(item.timestamp)));
  const newestItems = active.filter((item) => parseTime(item.timestamp) === createdAt);
  // Every announcement sharing the newest timestamp must carry this exact
  // message; an ambiguous tie never authorizes delivery.
  if (!newestItems.every((item) => String(item.message).trim() === message)) {
    return null;
  }
  const newest = newestItems[0];

  if (now - createdAt > ANNOUNCEMENT_MAX_AGE_MS) return null;
  if (createdAt - now > ANNOUNCEMENT_MAX_FUTURE_SKEW_MS) return null;
  return newest;
};

export const isExpoPushToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(value.trim());

export type RecipientProfile = { id: string; push_token: string | null };

/** Unique, well-formed push tokens, never including the sender's own devices. */
export const selectRecipientTokens = (
  profiles: RecipientProfile[],
  senderUserId: string,
): string[] => {
  const senderTokens = new Set(
    profiles
      .filter((profile) => profile.id === senderUserId && isExpoPushToken(profile.push_token))
      .map((profile) => String(profile.push_token).trim()),
  );
  const tokens = new Set<string>();
  for (const profile of profiles) {
    if (profile.id === senderUserId || !isExpoPushToken(profile.push_token)) continue;
    const token = profile.push_token.trim();
    if (!senderTokens.has(token)) tokens.add(token);
  }
  return [...tokens];
};

export const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};
