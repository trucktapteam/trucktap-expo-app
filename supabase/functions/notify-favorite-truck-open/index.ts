import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const payload = await req.json();
  console.log("Incoming payload:", payload);

  const record = payload.record;
  const oldRecord = payload.old_record;

  if (!record || !oldRecord) {
    return new Response("Missing data");
  }

  const wasOpen = oldRecord.is_open === true;
  const isOpenNow = record.is_open === true;

  // ONLY run when false -> true
  if (wasOpen || !isOpenNow) {
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
  const { data: favorites } = await supabase
    .from("favorites")
    .select("user_id")
    .eq("truck_id", truckId);

  if (!favorites || favorites.length === 0) {
    console.log("No favorites found");
    return new Response("No users");
  }

  const userIds = favorites.map(f => f.user_id);

  // Step 2: get push tokens
  const { data: profiles } = await supabase
  .from("profiles")
  .select("id, push_token, notify_favorites_open")
  .in("id", userIds)
  .not("push_token", "is", null)
  .eq("notify_favorites_open", true);
  if (!profiles || profiles.length === 0) {
    console.log("No push tokens found");
    return new Response("No tokens");
  }

  console.log("Users to notify:", profiles.length);

  const messages = profiles.map(p => ({
    to: p.push_token,
    sound: "default",
    title: `${truckName} is open`,
    body: `${truckName} just opened`,
    data: { truckId }
  }));

  console.log("Sending messages:", messages);

  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(messages)
  });

  return new Response("Notifications sent");
});