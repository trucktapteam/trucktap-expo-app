import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NOTIFICATION_TYPE = "new_truck_joined";

serve(async (req) => {
  try {
    const payload = await req.json();
    const record = payload.record ?? payload;
    const truckId = record?.truckId ?? record?.truck_id ?? record?.id;
    const truckName = record?.truckName ?? record?.truck_name ?? record?.name ?? "A new truck";

    console.log("[notify-new-truck] New profile/truck created:", {
      truckId,
      truckName,
      payloadKeys: Object.keys(payload ?? {}),
    });

    if (!truckId) {
      console.log("[notify-new-truck] Error response: missing truck id");
      return new Response("Missing truck id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: adminProfiles, error } = await supabase
      .from("profiles")
      .select("id, push_token")
      .eq("role", "admin")
      .not("push_token", "is", null);

    if (error) {
      console.log("[notify-new-truck] Error response: admin token query failed:", error.message);
      return new Response("Error", { status: 500 });
    }

    console.log("[notify-new-truck] Admin push tokens found:", adminProfiles?.length ?? 0);

    if (!adminProfiles || adminProfiles.length === 0) {
      console.log("[notify-new-truck] Error response: no admin push tokens found");
      return new Response("No admin push tokens", { status: 200 });
    }

    const messages = adminProfiles.map((p) => ({
      to: p.push_token,
      sound: "default",
      title: "New food truck added",
      body: `${truckName} just joined TruckTap`,
      data: {
        type: NOTIFICATION_TYPE,
        truckId,
        truck_id: truckId,
        route: `/truck/${truckId}`,
      },
    }));

    console.log("[notify-new-truck] Notification payload sent:", JSON.stringify(messages));

    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
    console.log("[notify-new-truck] Expo push ticket response:", JSON.stringify(result, null, 2));

    if (!res.ok) {
      console.log("[notify-new-truck] Error response: Expo push failed:", {
        status: res.status,
        result,
      });
      return new Response("Expo push failed", { status: 502 });
    }

    return new Response(
      JSON.stringify({ success: true, expoResult: result }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    console.log("[notify-new-truck] Error response: function error:", err);
    return new Response("Error", { status: 500 });
  }
});
