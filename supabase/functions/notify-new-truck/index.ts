import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authorizeDatabaseNotificationWebhook,
  DATABASE_NOTIFICATION_SECRET_ENV,
} from "../_shared/notificationAuth.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const NOTIFICATION_TYPE = "new_truck_joined";
type PushProfile = { push_token: string | null };

export const handler = async (req: Request): Promise<Response> => {
  try {
    const unauthorized = await authorizeDatabaseNotificationWebhook(
      req,
      Deno.env.get(DATABASE_NOTIFICATION_SECRET_ENV) ?? "",
    );
    if (unauthorized) return unauthorized;

    const payload = await req.json();
    const record = payload.record ?? payload;
    const truckId = record?.truckId ?? record?.truck_id ?? record?.id;
    const truckName =
      record?.truckName ?? record?.truck_name ?? record?.name ?? "A new truck";
    if (!truckId) {
      return new Response("Missing truck id", { status: 400 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: adminProfiles, error } = await supabase
      .from("profiles")
      .select("id, push_token")
      .eq("role", "admin")
      .not("push_token", "is", null);
    if (error) {
      console.log("notify-new-truck admin token query failed:", error.message);
      return new Response("Admin query failed", { status: 500 });
    }

    const messages = ((adminProfiles ?? []) as PushProfile[])
      .filter((profile: PushProfile) =>
        typeof profile.push_token === "string" &&
        profile.push_token.trim().length > 0
      )
      .map((profile: PushProfile) => ({
        to: profile.push_token,
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
    if (messages.length === 0) {
      return new Response("No usable admin push tokens", { status: 200 });
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

    const tickets = Array.isArray(expoResult?.data) ? expoResult.data : [];
    const ticketErrorCount = tickets.filter(
      (ticket: { status?: string }) => ticket?.status === "error",
    ).length;
    return Response.json({ success: true, expoResult, ticketErrorCount });
  } catch (error) {
    console.log(
      "notify-new-truck error:",
      error instanceof Error ? error.message : "unknown",
    );
    return new Response("Server error", { status: 500 });
  }
};

Deno.serve(handler);
