import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_SIZE = 100;
const WEBHOOK_SECRET_HEADER = "x-trucktap-webhook-secret";

type OwnerMessageRecord = {
  id: string;
  target_scope: "all_trucks" | "truck";
  target_truck_id: string | null;
};

type ExpoPushTicket = {
  status?: string;
  message?: string;
  details?: { error?: string };
};

const isExpoPushToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(value.trim());

const chunk = <T>(values: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
};

const secretsMatch = async (provided: string, expected: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};

Deno.serve(async (req: Request) => {
  try {
    const expectedSecret = Deno.env.get("OWNER_MESSAGE_WEBHOOK_SECRET") ?? "";
    const providedSecret = req.headers.get(WEBHOOK_SECRET_HEADER) ?? "";
    if (!expectedSecret || !providedSecret || !(await secretsMatch(providedSecret, expectedSecret))) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const incomingRecord = (payload.record ?? payload) as Partial<OwnerMessageRecord>;

    if (!incomingRecord.id) {
      console.log("notify-owner-message skipped: missing message id");
      return new Response("Missing message id", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Reload the committed row rather than trusting webhook payload fields.
    const { data: message, error: messageError } = await supabase
      .from("owner_messages")
      .select("id, target_scope, target_truck_id")
      .eq("id", incomingRecord.id)
      .maybeSingle<OwnerMessageRecord>();

    if (messageError || !message) {
      console.log("notify-owner-message message lookup failed:", messageError?.message ?? "not found");
      return new Response("Message lookup failed", { status: 200 });
    }

    // The primary-key insert is an atomic, durable at-most-once claim. Failed
    // attempts retain the claim, so automatic or malicious replays cannot resend.
    const { error: claimError } = await supabase
      .from("owner_message_notification_deliveries")
      .insert({ message_id: message.id });

    if (claimError) {
      if (claimError.code === "23505") {
        console.log("notify-owner-message skipped: delivery already claimed", message.id);
        return new Response("Delivery already claimed", { status: 200 });
      }
      console.log("notify-owner-message delivery claim failed:", claimError.message);
      return new Response("Delivery claim failed", { status: 500 });
    }

    const finishDelivery = async (
      status: "completed" | "failed",
      attemptedDevices: number,
      failures: number,
      error: string | null = null,
    ) => {
      const result = await supabase
        .from("owner_message_notification_deliveries")
        .update({
          status,
          finished_at: new Date().toISOString(),
          attempted_devices: attemptedDevices,
          failure_count: failures,
          error,
        })
        .eq("message_id", message.id);
      if (result.error) {
        console.log("notify-owner-message delivery status update failed:", result.error.message);
      }
    };

    let ownerQuery = supabase
      .from("trucks")
      .select("owner_id")
      .not("owner_id", "is", null);

    if (message.target_scope === "truck") {
      if (!message.target_truck_id) {
        console.log("notify-owner-message skipped: targeted message has no truck id", message.id);
        return new Response("Missing target truck", { status: 200 });
      }
      ownerQuery = ownerQuery.eq("id", message.target_truck_id);
    }

    const { data: trucks, error: trucksError } = await ownerQuery;
    if (trucksError) {
      console.log("notify-owner-message owner lookup failed:", trucksError.message);
      await finishDelivery("failed", 0, 0, "Owner lookup failed");
      return new Response("Owner lookup failed", { status: 200 });
    }

    const ownerIds = [...new Set(
      (trucks ?? [])
        .map((truck: { owner_id: string | null }) => truck.owner_id)
        .filter((ownerId: string | null): ownerId is string => Boolean(ownerId))
    )];

    if (ownerIds.length === 0) {
      console.log("notify-owner-message skipped: no target owners", message.id);
      await finishDelivery("completed", 0, 0);
      return new Response("No target owners", { status: 200 });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, push_token")
      .in("id", ownerIds);

    if (profilesError) {
      console.log("notify-owner-message token lookup failed:", profilesError.message);
      await finishDelivery("failed", 0, 0, "Token lookup failed");
      return new Response("Token lookup failed", { status: 200 });
    }

    // An owner can have multiple trucks, and stale profile rows can share a token.
    // Send at most one push to each registered device for this message, while
    // keeping the token -> owning profile ids mapping so stale tokens can be cleared.
    const tokenToProfileIds = new Map<string, Set<string>>();
    for (const profile of (profiles ?? []) as { id: string; push_token: unknown }[]) {
      if (!isExpoPushToken(profile.push_token)) continue;
      const token = profile.push_token.trim();
      if (!tokenToProfileIds.has(token)) {
        tokenToProfileIds.set(token, new Set());
      }
      tokenToProfileIds.get(token)!.add(profile.id);
    }
    const tokens = [...tokenToProfileIds.keys()];

    if (tokens.length === 0) {
      console.log("notify-owner-message skipped: no valid push tokens", message.id);
      await finishDelivery("completed", 0, 0);
      return new Response("No valid push tokens", { status: 200 });
    }

    let failureCount = 0;
    const staleProfileIds = new Set<string>();
    for (const tokenBatch of chunk(tokens, EXPO_BATCH_SIZE)) {
      try {
        const notifications = tokenBatch.map((token) => ({
          to: token,
          sound: "default",
          title: "TruckTap",
          body: "You have a new message from the TruckTap Team.",
          data: { type: "owner_message", messageId: message.id },
        }));

        const expoResponse = await fetch(EXPO_PUSH_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notifications),
        });
        const expoResult = await expoResponse.json();
        const tickets = (Array.isArray(expoResult?.data) ? expoResult.data : []) as ExpoPushTicket[];
        const ticketFailures = tickets.filter((ticket) => ticket.status === "error");
        failureCount += expoResponse.ok ? ticketFailures.length : tokenBatch.length;

        if (expoResponse.ok) {
          tickets.forEach((ticket, index) => {
            if (ticket.status !== "error") return;
            const detailError = ticket.details?.error;
            const ticketMessage = typeof ticket.message === "string" ? ticket.message.toLowerCase() : "";
            const isDeviceNotRegistered =
              detailError === "DeviceNotRegistered" ||
              ticketMessage.includes("not a registered push notification recipient");
            if (!isDeviceNotRegistered) return;

            const staleToken = tokenBatch[index];
            for (const profileId of tokenToProfileIds.get(staleToken) ?? []) {
              staleProfileIds.add(profileId);
            }
          });
        }

        if (!expoResponse.ok || ticketFailures.length > 0) {
          console.log("notify-owner-message Expo delivery failure:", JSON.stringify({
            messageId: message.id,
            httpStatus: expoResponse.status,
            ticketFailures,
          }));
        }
      } catch (error) {
        failureCount += tokenBatch.length;
        console.log("notify-owner-message Expo request failed:", {
          messageId: message.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    let staleTokensCleared = 0;
    if (staleProfileIds.size > 0) {
      const staleTokenCleanup = await supabase
        .from("profiles")
        .update({ push_token: null })
        .in("id", [...staleProfileIds]);

      if (staleTokenCleanup.error) {
        console.log("notify-owner-message stale token cleanup failed:", {
          messageId: message.id,
          attempted: staleProfileIds.size,
          error: staleTokenCleanup.error.message,
        });
      } else {
        staleTokensCleared = staleProfileIds.size;
      }
    }

    console.log("notify-owner-message completed:", {
      messageId: message.id,
      uniqueOwners: ownerIds.length,
      uniqueDevices: tokens.length,
      failureCount,
      staleTokensCleared,
    });

    await finishDelivery(
      failureCount === 0 ? "completed" : "failed",
      tokens.length,
      failureCount,
      failureCount === 0 ? null : "One or more Expo deliveries failed",
    );

    // Always return success after processing. The message is already committed,
    // and automatic retries could duplicate notifications on successful devices.
    return new Response(JSON.stringify({
      success: failureCount === 0,
      messageId: message.id,
      attempted: tokens.length,
      failureCount,
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log("notify-owner-message error:", error);
    return new Response("Push processing failed", { status: 200 });
  }
});
