import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createAnnouncementHandler, type PushMessage } from "./handler.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const sendPush = async (messages: PushMessage[]) => {
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(messages),
  });
  if (!response.ok) return { ok: false, errorCount: messages.length };
  const result = await response.json().catch(() => null);
  const tickets = Array.isArray(result?.data) ? result.data : [];
  const errorCount = tickets.filter(
    (ticket: { status?: string }) => ticket?.status === "error",
  ).length;
  return { ok: true, errorCount };
};

export const handler = createAnnouncementHandler({
  createAdminClient: () => {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return null;
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  },
  sendPush,
});

Deno.serve(handler);
