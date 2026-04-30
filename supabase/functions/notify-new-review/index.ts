import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    const truckId = record?.truck_id;

    if (!truckId) {
      console.log("notify-new-review skipped: missing truck_id");
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
      console.log("notify-new-review truck query error:", truckError.message);
      return new Response("Truck query failed", { status: 500 });
    }

    if (!truck?.owner_id) {
      console.log("notify-new-review skipped: missing owner_id");
      return new Response("Missing owner", { status: 200 });
    }

    if (record?.user_id && record.user_id === truck.owner_id) {
      console.log("notify-new-review skipped: owner reviewed own truck");
      return new Response("Owner review skipped", { status: 200 });
    }

    let { data: owner, error: ownerError } = await supabase
      .from("profiles")
      .select("push_token, notify_owner_reviews")
      .eq("id", truck.owner_id)
      .maybeSingle();

    if (ownerError) {
      console.log("notify-new-review owner query with preference failed:", ownerError.message);

      const fallback = await supabase
        .from("profiles")
        .select("push_token")
        .eq("id", truck.owner_id)
        .maybeSingle();

      owner = fallback.data;
      ownerError = fallback.error;

      if (ownerError) {
        console.log("notify-new-review owner fallback query error:", ownerError.message);
        return new Response("Owner query failed", { status: 500 });
      }
    }

    if (owner?.notify_owner_reviews === false) {
      console.log("notify-new-review skipped: owner preference disabled");
      return new Response("Owner preference disabled", { status: 200 });
    }

    if (!owner?.push_token) {
      console.log("notify-new-review skipped: no push token");
      return new Response("No push token", { status: 200 });
    }

    const rating = Number(record?.rating);
    const hasRating = record?.rating !== null && record?.rating !== undefined && Number.isFinite(rating);
    const body = hasRating
      ? `⭐ You got a new ${rating}-star review!`
      : "Check out what someone said about your truck.";

    const message = {
      to: owner.push_token,
      sound: "default",
      title: "⭐ New review received!",
      body,
      data: { truckId, reviewId: record?.id, type: "new_review" },
    };

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    });

    const expoResult = await expoResponse.json();
    console.log("notify-new-review Expo response:", JSON.stringify(expoResult));

    if (!expoResponse.ok) {
      return new Response("Expo push failed", { status: 502 });
    }

    return new Response(JSON.stringify({ success: true, expoResult }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log("notify-new-review error:", err);
    return new Response("Server error", { status: 500 });
  }
});
