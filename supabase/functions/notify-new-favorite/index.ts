import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authorizeDatabaseNotificationWebhook,
  DATABASE_NOTIFICATION_SECRET_ENV,
} from "../_shared/notificationAuth.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const FAVORITE_COOLDOWN_MS = 10 * 60 * 1000;

export const handler = async (req: Request): Promise<Response> => {
  try {
    const unauthorized = await authorizeDatabaseNotificationWebhook(
      req,
      Deno.env.get(DATABASE_NOTIFICATION_SECRET_ENV) ?? "",
    );
    if (unauthorized) return unauthorized;

    const payload = await req.json();
    const record = payload.record ?? payload;
    const truckId = record?.truck_id;

    if (!truckId) {
      console.log("notify-new-favorite skipped: missing truck_id");
      return new Response("Missing truck_id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: truck, error: truckError } = await supabase
      .from("trucks")
      .select("id, owner_id")
      .eq("id", truckId)
      .maybeSingle();

    if (truckError) {
      console.log("notify-new-favorite truck query error:", truckError.message);
      return new Response("Truck query failed", { status: 500 });
    }

    if (!truck?.owner_id) {
      console.log("notify-new-favorite skipped: missing owner_id");
      return new Response("Missing owner", { status: 200 });
    }

    if (record?.user_id && record.user_id === truck.owner_id) {
      console.log("notify-new-favorite skipped: owner favorited own truck");
      return new Response("Owner favorite skipped", { status: 200 });
    }

    let { data: owner, error: ownerError } = await supabase
      .from("profiles")
      .select("id, push_token, last_favorite_notification_at, notify_owner_favorites")
      .eq("id", truck.owner_id)
      .maybeSingle();

    if (ownerError) {
      console.log("notify-new-favorite owner query with preference failed:", ownerError.message);
      const fallback = await supabase
        .from("profiles")
        .select("id, push_token, last_favorite_notification_at")
        .eq("id", truck.owner_id)
        .maybeSingle();
      owner = fallback.data;
      ownerError = fallback.error;
      if (ownerError) {
        console.log("notify-new-favorite owner fallback query error:", ownerError.message);
        return new Response("Owner query failed", { status: 500 });
      }
    }

    if (owner?.notify_owner_favorites === false) {
      return new Response("Owner preference disabled", { status: 200 });
    }
    if (!owner?.push_token) {
      return new Response("No push token", { status: 200 });
    }

    const lastSentAt = owner.last_favorite_notification_at
      ? new Date(owner.last_favorite_notification_at).getTime()
      : 0;
    if (lastSentAt && Date.now() - lastSentAt < FAVORITE_COOLDOWN_MS) {
      return new Response("Cooldown active", { status: 200 });
    }

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: owner.push_token,
        sound: "default",
        title: "❤️ Someone favorited your truck!",
        body: "You're gaining fans on TruckTap.",
        data: { truckId, type: "new_favorite" },
      }),
    });
    const expoResult = await expoResponse.json();
    if (!expoResponse.ok) {
      return new Response("Expo push failed", { status: 502 });
    }

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ last_favorite_notification_at: new Date().toISOString() })
      .eq("id", truck.owner_id);
    if (updateError) {
      console.log("notify-new-favorite throttle update error:", updateError.message);
    }

    return Response.json({ success: true, expoResult });
  } catch (error) {
    console.log(
      "notify-new-favorite error:",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response("Server error", { status: 500 });
  }
};

Deno.serve(handler);
