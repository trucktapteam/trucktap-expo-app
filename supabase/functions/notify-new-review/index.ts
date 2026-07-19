import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authorizeDatabaseNotificationWebhook,
  DATABASE_NOTIFICATION_SECRET_ENV,
} from "../_shared/notificationAuth.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

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
      console.log("notify-new-review truck query error:", truckError.message);
      return new Response("Truck query failed", { status: 500 });
    }
    if (!truck?.owner_id) {
      return new Response("Missing owner", { status: 200 });
    }
    if (record?.user_id && record.user_id === truck.owner_id) {
      return new Response("Owner review skipped", { status: 200 });
    }

    let { data: owner, error: ownerError } = await supabase
      .from("profiles")
      .select("push_token, notify_owner_reviews")
      .eq("id", truck.owner_id)
      .maybeSingle();
    if (ownerError) {
      const fallback = await supabase
        .from("profiles")
        .select("push_token")
        .eq("id", truck.owner_id)
        .maybeSingle();
      owner = fallback.data;
      ownerError = fallback.error;
      if (ownerError) {
        console.log("notify-new-review owner query error:", ownerError.message);
        return new Response("Owner query failed", { status: 500 });
      }
    }

    if (owner?.notify_owner_reviews === false) {
      return new Response("Owner preference disabled", { status: 200 });
    }
    if (!owner?.push_token) {
      return new Response("No push token", { status: 200 });
    }

    const rating = Number(record?.rating);
    const hasRating =
      record?.rating !== null &&
      record?.rating !== undefined &&
      Number.isFinite(rating);
    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: owner.push_token,
        sound: "default",
        title: "⭐ New review received!",
        body: hasRating
          ? `⭐ You got a new ${rating}-star review!`
          : "Check out what someone said about your truck.",
        data: { truckId, reviewId: record?.id, type: "new_review" },
      }),
    });
    const expoResult = await expoResponse.json();
    if (!expoResponse.ok) {
      return new Response("Expo push failed", { status: 502 });
    }
    return Response.json({ success: true, expoResult });
  } catch (error) {
    console.log(
      "notify-new-review error:",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response("Server error", { status: 500 });
  }
};

Deno.serve(handler);
