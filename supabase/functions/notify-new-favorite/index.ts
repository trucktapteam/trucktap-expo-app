import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const FAVORITE_COOLDOWN_MS = 10 * 60 * 1000;

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    const truckId = record?.truck_id;

    if (!truckId) {
      console.log("notify-new-favorite skipped: missing truck_id");
      return new Response("Missing truck_id", { status: 200 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
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
      console.log("notify-new-favorite skipped: owner preference disabled");
      return new Response("Owner preference disabled", { status: 200 });
    }

    if (!owner?.push_token) {
      console.log("notify-new-favorite skipped: no push token");
      return new Response("No push token", { status: 200 });
    }

    const lastSentAt = owner.last_favorite_notification_at
      ? new Date(owner.last_favorite_notification_at).getTime()
      : 0;

    if (lastSentAt && Date.now() - lastSentAt < FAVORITE_COOLDOWN_MS) {
      console.log("notify-new-favorite skipped: cooldown active");
      return new Response("Cooldown active", { status: 200 });
    }

    const message = {
      to: owner.push_token,
      sound: "default",
      title: "❤️ Someone favorited your truck!",
      body: "You're gaining fans on TruckTap.",
      data: { truckId, type: "new_favorite" },
    };

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    const expoResult = await expoResponse.json();
    console.log("notify-new-favorite Expo response:", JSON.stringify(expoResult));

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

    return new Response(JSON.stringify({ success: true, expoResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("notify-new-favorite error:", err);
    return new Response("Server error", { status: 500 });
  }
});
