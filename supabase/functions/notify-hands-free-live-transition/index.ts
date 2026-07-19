// @ts-ignore Deno resolves npm imports at the Edge runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  serve: (handler: (request: Request) => Response | Promise<Response>) => void;
  env: { get: (key: string) => string | undefined };
};

type LiveEvent = {
  id: string;
  truck_id: string;
  action: "go_live" | "go_offline";
  source: string;
  stop_id: string | null;
  location_label: string | null;
};

type TruckRow = {
  id: string;
  name: string | null;
  owner_id: string | null;
};

type OwnerProfile = {
  id: string;
  push_token: string | null;
  notify_hands_free_live_confirmations: boolean | null;
};

type DeliveryClaim = {
  claimed: boolean;
  attempt_count: number;
};

type ExpoTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

const WEBHOOK_SECRET_ENV = "HANDS_FREE_LIVE_WEBHOOK_SECRET";
const WEBHOOK_SECRET_HEADER = "x-trucktap-webhook-secret";
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const secretsMatch = async (
  provided: string,
  expected: string,
): Promise<boolean> => {
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

const isExpoPushToken = (value: unknown): value is string =>
  typeof value === "string" &&
  /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(value.trim());

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const handler = async (request: Request): Promise<Response> => {
  try {
    const expectedSecret = Deno.env.get(WEBHOOK_SECRET_ENV) ?? "";
    const providedSecret = request.headers.get(WEBHOOK_SECRET_HEADER) ?? "";

    if (
      !expectedSecret ||
      !providedSecret ||
      !(await secretsMatch(providedSecret, expectedSecret))
    ) {
      return new Response("Unauthorized", { status: 401 });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const payload = await request.json().catch(() => null) as
      | { event_id?: unknown }
      | null;
    const eventId =
      typeof payload?.event_id === "string" ? payload.event_id.trim() : "";

    if (!UUID_PATTERN.test(eventId)) {
      return new Response("Invalid event", { status: 400 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      console.log("Hands-Free LIVE confirmation configuration missing", {
        eventId,
      });
      return new Response("Server configuration error", { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: eventData, error: eventError } = await supabase
      .from("truck_live_events")
      .select("id, truck_id, action, source, stop_id, location_label")
      .eq("id", eventId)
      .maybeSingle<LiveEvent>();

    const event = eventData as LiveEvent | null;
    if (
      eventError ||
      !event ||
      event.source !== "schedule" ||
      !["go_live", "go_offline"].includes(event.action)
    ) {
      console.log("Hands-Free LIVE confirmation event rejected", {
        eventId,
        found: Boolean(event),
        source: event?.source ?? null,
        action: event?.action ?? null,
      });
      return new Response("Event not eligible", { status: 400 });
    }

    const { data: claimData, error: claimError } = await supabase
      .rpc("claim_hands_free_live_notification_delivery", {
        p_event_id: event.id,
      });

    if (claimError) {
      console.log("Hands-Free LIVE confirmation claim failed", {
        eventId,
        code: claimError.code,
      });
      return new Response("Delivery claim failed", { status: 500 });
    }

    const claim = (
      Array.isArray(claimData) ? claimData[0] : claimData
    ) as DeliveryClaim | null;
    if (!claim?.claimed) {
      return jsonResponse({ success: true, duplicate: true, eventId });
    }
    const claimAttempt = claim.attempt_count;

    const finishDelivery = async (
      status: "completed" | "failed",
      attemptedDevices: number,
      failureCount: number,
      error: string | null = null,
    ) => {
      const result = await supabase
        .from("hands_free_live_notification_deliveries")
        .update({
          status,
          finished_at: new Date().toISOString(),
          attempted_devices: attemptedDevices,
          failure_count: failureCount,
          error,
        })
        .eq("event_id", event.id)
        .eq("attempt_count", claimAttempt)
        .eq("status", "processing");

      if (result.error) {
        console.log("Hands-Free LIVE delivery status update failed", {
          eventId,
          code: result.error.code,
        });
      }
    };

    const { data: truckData, error: truckError } = await supabase
      .from("trucks")
      .select("id, name, owner_id")
      .eq("id", event.truck_id)
      .maybeSingle<TruckRow>();
    const truck = truckData as TruckRow | null;

    if (truckError || !truck?.owner_id) {
      await finishDelivery("failed", 0, 0, "Owner lookup failed");
      return jsonResponse({ success: false, eventId, reason: "owner_lookup" });
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, push_token, notify_hands_free_live_confirmations")
      .eq("id", truck.owner_id)
      .maybeSingle<OwnerProfile>();
    const profile = profileData as OwnerProfile | null;

    if (profileError || !profile) {
      await finishDelivery("failed", 0, 0, "Profile lookup failed");
      return jsonResponse({ success: false, eventId, reason: "profile_lookup" });
    }

    if (profile.notify_hands_free_live_confirmations !== true) {
      await finishDelivery("completed", 0, 0);
      return jsonResponse({ success: true, eventId, skipped: "preference_off" });
    }

    if (!isExpoPushToken(profile.push_token)) {
      if (profile.push_token) {
        await supabase
          .from("profiles")
          .update({ push_token: null })
          .eq("id", profile.id);
      }
      await finishDelivery("completed", 0, 0);
      return jsonResponse({ success: true, eventId, skipped: "no_valid_token" });
    }

    const truckName = truck.name?.trim() || "Your truck";
    const wentLive = event.action === "go_live";
    const title = wentLive
      ? "Automatically went LIVE"
      : "Automatically stopped serving";
    const locationSuffix = event.location_label?.trim()
      ? ` at ${event.location_label.trim()}`
      : "";
    const body = wentLive
      ? `${truckName} is now LIVE${locationSuffix}.`
      : `${truckName} is now OFFLINE after its scheduled stop${locationSuffix}.`;

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: profile.push_token.trim(),
        sound: "default",
        title,
        body,
        data: {
          type: "hands_free_live_confirmation",
          route: "/(truck)/upcoming-stops",
          truck_id: event.truck_id,
          stop_id: event.stop_id,
          event_id: event.id,
          action: event.action,
        },
      }),
    });

    const expoJson = await expoResponse.json().catch(() => null);
    const ticket = expoJson?.data as ExpoTicket | undefined;
    const failed = !expoResponse.ok || ticket?.status === "error";

    if (
      ticket?.status === "error" &&
      (
        ticket.details?.error === "DeviceNotRegistered" ||
        ticket.message?.toLowerCase().includes(
          "not a registered push notification recipient",
        )
      )
    ) {
      await supabase
        .from("profiles")
        .update({ push_token: null })
        .eq("id", profile.id);
    }

    await finishDelivery(
      failed ? "failed" : "completed",
      1,
      failed ? 1 : 0,
      failed ? "Expo delivery failed" : null,
    );

    console.log("Hands-Free LIVE confirmation processed", {
      eventId,
      action: event.action,
      attempted: 1,
      success: !failed,
    });

    return jsonResponse({
      success: !failed,
      eventId,
      attempted: 1,
      failureCount: failed ? 1 : 0,
    });
  } catch (error) {
    console.log("Hands-Free LIVE confirmation failed", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return new Response("Push processing failed", { status: 500 });
  }
};

Deno.serve(handler);
