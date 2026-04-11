import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function decodeJwtPayload(token: string) {
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("JWT does not have 3 parts");

  const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return JSON.parse(atob(padded));
}

serve(async (req) => {
  try {
    console.log("Account delete function called");

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.log("Missing Authorization header");
      return new Response(
        JSON.stringify({ success: false, error: "Missing Authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    console.log("Token received (first 50 chars):", token.substring(0, 50));

    const payload = decodeJwtPayload(token);
    const userId = payload?.sub;

    console.log("Decoded userId:", userId);

    if (!userId) {
      console.log("Could not determine user id from token");
      return new Response(
        JSON.stringify({ success: false, error: "Could not determine user id from token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    console.log("Admin client created");

    // Delete favorites
    console.log("Deleting favorites for userId:", userId);
    const { error: favoritesError } = await admin
      .from("favorites")
      .delete()
      .eq("user_id", userId);

    if (favoritesError) {
      console.log("Favorites deletion error:", favoritesError);
      return new Response(
        JSON.stringify({
          success: false,
          step: "favorites",
          error: favoritesError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("Favorites deleted successfully");

    // Delete profile
    console.log("Deleting profile for userId:", userId);
    const { error: profileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.log("Profile deletion error:", profileError);
      return new Response(
        JSON.stringify({
          success: false,
          step: "profiles",
          error: profileError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("Profile deleted successfully");

    // Delete auth user
    console.log("Deleting auth user:", userId);
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.log("Auth delete error:", authDeleteError);
      return new Response(
        JSON.stringify({
          success: false,
          step: "auth",
          error: authDeleteError.message,
        }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
    console.log("Auth user deleted successfully");

    console.log("Account deletion completed successfully for userId:", userId);
    return new Response(
      JSON.stringify({
        success: true,
        userId,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.log("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});