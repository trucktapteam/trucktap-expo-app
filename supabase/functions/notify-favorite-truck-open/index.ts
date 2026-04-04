import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    console.log("Incoming payload:", payload);

    const record = payload.record;
const oldRecord = payload.old_record;

  if (!record) {
  return new Response("Missing record");
  }

    const wasOpen = oldRecord?.is_open === true;
const isOpenNow = record.is_open === true;

if (!isOpenNow || wasOpen === true) {
  console.log("Not a valid open event, skipping");
  return new Response("Skipped");
}

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const truckId = record.id;
    const truckName = record.name ?? "A favorite truck";

    // Step 1: get users who favorited this truck
    const { data: favorites, error: favoritesError } = await supabase
      .from("favorites")
      .select("user_id")
      .eq("truck_id", truckId);

    if (favoritesError) {
      console.log("Favorites query error:", favoritesError.message);
      return new Response(favoritesError.message, { status: 500 });
    }

    if (!favorites || favorites.length === 0) {
      console.log("No favorites found");
      return new Response("No users", { status: 200 });
    }

    const userIds = favorites.map((f) => f.user_id);

    // Step 2: get push tokens
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, push_token, notify_favorites_open")
      .in("id", userIds)
      .not("push_token", "is", null)
      .eq("notify_favorites_open", true);

    if (profilesError) {
      console.log("Profiles query error:", profilesError.message);
      return new Response(profilesError.message, { status: 500 });
    }

    if (!profiles || profiles.length === 0) {
      console.log("No push tokens found");
      return new Response("No tokens", { status: 200 });
    }

    console.log("Users to notify:", profiles.length);

    const messages = profiles.map((p) => ({
      to: p.push_token,
      sound: "default",
      title: `${truckName} is open`,
      body: `${truckName} just opened`,
      data: { truckId },
    }));

    console.log("Sending messages:", messages);

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResponse.json();

    console.log("Expo status:", expoResponse.status);
    console.log("Expo response:", expoJson);

    return new Response("Notifications sent", { status: 200 });
  } catch (err) {
    console.log("Unexpected function error:", err);
    return new Response("Function crashed", { status: 500 });
  }
});