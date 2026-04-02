import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const { truckId, truckName } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get users who want new truck notifications
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("push_token")
      .eq("notify_new_trucks", true)
      .not("push_token", "is", null);

    if (error) {
      console.log("Error fetching profiles:", error);
      return new Response("Error", { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      console.log("No users to notify");
      return new Response("No users", { status: 200 });
    }
    
    console.log("Users to notify:", profiles.length);
    
    const messages = profiles.map((p) => ({
      to: p.push_token,
      sound: "default",
      title: "New food truck added 🚚",
      body: `${truckName} just joined TruckTap`,
      data: { truckId },
    }));

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const result = await res.json();
console.log("Push result:", JSON.stringify(result, null, 2));

return new Response(
  JSON.stringify({ success: true, expoResult: result }),
  {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }
);
  } catch (err) {
    console.log("Function error:", err);
    return new Response("Error", { status: 500 });
  }
});