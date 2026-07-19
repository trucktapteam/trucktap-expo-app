import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  canSendTruckAnnouncement,
  getBearerToken,
} from "../_shared/notificationAuth.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
type PushProfile = { push_token: string | null };

export const handler = async (req: Request): Promise<Response> => {
  try {
    if (req.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return new Response("Unauthorized", { status: 401 });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) {
      return new Response("Server configuration error", { status: 500 });
    }
    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: authData, error: authError } =
      await admin.auth.getUser(token);
    if (authError || !authData.user) {
      return new Response("Unauthorized", { status: 401 });
    }

    const payload = await req.json();
    const truckId =
      typeof payload?.truckId === "string" ? payload.truckId.trim() : "";
    const message =
      typeof payload?.message === "string" ? payload.message.trim() : "";
    if (!truckId || !message) {
      return new Response("Missing truckId or message", { status: 400 });
    }

    const [{ data: truck, error: truckError }, { data: profile }] =
      await Promise.all([
        admin
          .from("trucks")
          .select("id, owner_id")
          .eq("id", truckId)
          .maybeSingle(),
        admin
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .maybeSingle(),
      ]);
    if (truckError) {
      return new Response("Truck lookup failed", { status: 500 });
    }
    if (
      !truck ||
      !canSendTruckAnnouncement(
        authData.user.id,
        truck.owner_id,
        profile?.role,
      )
    ) {
      return new Response("Forbidden", { status: 403 });
    }

    const { data: profiles, error: profilesError } = await admin
      .from("profiles")
      .select("push_token")
      .eq("notify_announcements", true)
      .not("push_token", "is", null);
    if (profilesError) {
      console.log("notify-truck-announcement profile query failed:", profilesError.message);
      return new Response("Profile query failed", { status: 500 });
    }

    const messages = ((profiles ?? []) as PushProfile[])
      .filter((profile: PushProfile) =>
        typeof profile.push_token === "string" &&
        profile.push_token.trim().length > 0
      )
      .map((profile: PushProfile) => ({
        to: profile.push_token,
        sound: "default",
        title: "New Truck Update 🚚",
        body: message,
        data: { truckId, truck_id: truckId },
      }));
    if (messages.length === 0) {
      return new Response("No users to notify", { status: 200 });
    }

    const expoResponse = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(messages),
    });
    const expoResult = await expoResponse.json();
    if (!expoResponse.ok) {
      return new Response("Expo push failed", { status: 502 });
    }
    return Response.json({ success: true, expoResult });
  } catch (error) {
    console.log(
      "notify-truck-announcement error:",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response("Server error", { status: 500 });
  }
};

Deno.serve(handler);
