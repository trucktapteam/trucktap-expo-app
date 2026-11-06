import {
  canSendTruckAnnouncement,
  getBearerToken,
} from "../_shared/notificationAuth.ts";
import {
  chunk,
  EXPO_PUSH_BATCH_SIZE,
  findDeliverableAnnouncement,
  parseAnnouncementRequest,
  type RecipientProfile,
  selectRecipientTokens,
} from "../_shared/truckAnnouncement.ts";

// Minimal structural view of the service-role client this handler uses, so
// tests can supply an in-memory fake instead of a real Supabase client.
// deno-lint-ignore no-explicit-any
type AdminClient = any;

export type PushMessage = {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: Record<string, string>;
};

export type PushResult = { ok: boolean; errorCount: number };

export type AnnouncementHandlerDeps = {
  /** Returns null when server configuration is missing. */
  createAdminClient: () => AdminClient | null;
  sendPush: (messages: PushMessage[]) => Promise<PushResult>;
  now?: () => number;
};

const text = (body: string, status: number) => new Response(body, { status });

export const createAnnouncementHandler = (deps: AnnouncementHandlerDeps) =>
  async (req: Request): Promise<Response> => {
    try {
      if (req.method !== "POST") return text("Method not allowed", 405);

      // 1. Authenticate: a Supabase user session JWT is required. The legacy
      //    anon key passes the gateway's verify_jwt check but has no user, so
      //    auth.getUser rejects it here.
      const token = getBearerToken(req);
      if (!token) return text("Unauthorized", 401);

      const admin = deps.createAdminClient();
      if (!admin) return text("Server configuration error", 500);

      const { data: authData, error: authError } = await admin.auth.getUser(token);
      const userId: string | undefined = authData?.user?.id;
      if (authError || !userId) return text("Unauthorized", 401);

      // 2. Validate the request. Recipients are never accepted from the caller.
      let payload: unknown = null;
      try {
        payload = await req.json();
      } catch {
        return text("Invalid JSON body", 400);
      }
      const request = parseAnnouncementRequest(payload);
      if (!request) return text("Missing or invalid truckId or message", 400);

      // 3. Authorize: only the truck's owner (or an admin) may announce.
      const [truckResult, profileResult] = await Promise.all([
        admin
          .from("trucks")
          .select("id, owner_id, announcements")
          .eq("id", request.truckId)
          .maybeSingle(),
        admin.from("profiles").select("role").eq("id", userId).maybeSingle(),
      ]);
      if (truckResult.error) return text("Truck lookup failed", 500);
      const truck = truckResult.data;
      if (
        !truck ||
        !canSendTruckAnnouncement(userId, truck.owner_id, profileResult.data?.role)
      ) {
        return text("Forbidden", 403);
      }

      // 4. Only push text the owner has just published on this truck.
      const now = deps.now ? deps.now() : Date.now();
      const announcement = findDeliverableAnnouncement(
        truck.announcements,
        request.message,
        now,
      );
      if (!announcement) {
        console.log("notify-truck-announcement skipped: no matching fresh announcement", {
          truckId: request.truckId,
        });
        return text("No matching recent announcement", 409);
      }

      // 5. Audience: customers who favorited this truck AND opted in.
      const favoritesResult = await admin
        .from("favorites")
        .select("user_id")
        .eq("truck_id", request.truckId);
      if (favoritesResult.error) return text("Favorites lookup failed", 500);

      const followerIds = [
        ...new Set(
          ((favoritesResult.data ?? []) as { user_id: string | null }[])
            .map((row) => row.user_id)
            .filter((id): id is string => typeof id === "string" && id !== userId),
        ),
      ];
      if (followerIds.length === 0) {
        return Response.json({ success: true, recipients: 0 });
      }

      const profilesResult = await admin
        .from("profiles")
        .select("id, push_token")
        .in("id", followerIds)
        .eq("notify_announcements", true)
        .not("push_token", "is", null);
      if (profilesResult.error) return text("Profile lookup failed", 500);

      const tokens = selectRecipientTokens(
        (profilesResult.data ?? []) as RecipientProfile[],
        userId,
      );
      if (tokens.length === 0) {
        return Response.json({ success: true, recipients: 0 });
      }

      // 6. Deliver. The response reports counts only: Expo tickets can echo
      //    recipients' push tokens, which must never reach the caller.
      let errorCount = 0;
      let failedBatches = 0;
      for (const batch of chunk(tokens, EXPO_PUSH_BATCH_SIZE)) {
        const result = await deps.sendPush(
          batch.map((to) => ({
            to,
            sound: "default",
            title: "New Truck Update 🚚",
            body: request.message,
            data: { truckId: request.truckId, truck_id: request.truckId },
          })),
        );
        if (!result.ok) failedBatches += 1;
        errorCount += result.errorCount;
      }

      console.log("notify-truck-announcement delivered", {
        truckId: request.truckId,
        recipients: tokens.length,
        errorCount,
        failedBatches,
      });
      if (failedBatches > 0) return text("Push delivery failed", 502);
      return Response.json({ success: true, recipients: tokens.length, errorCount });
    } catch (error) {
      console.log(
        "notify-truck-announcement error:",
        error instanceof Error ? error.message : "unknown",
      );
      return text("Server error", 500);
    }
  };
