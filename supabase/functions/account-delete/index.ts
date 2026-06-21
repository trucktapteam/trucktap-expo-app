import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRUCK_OWNER_DELETE_MESSAGE =
  "This account owns a food truck profile. Please contact TruckTap support to transfer or remove the truck before deleting your account.";

const isMissingTableError = (error: any) => {
  const message = String(error?.message ?? "").toLowerCase();
  return error?.code === "42P01" || (message.includes("relation") && message.includes("does not exist"));
};

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function deleteRows(admin: any, table: string, userId: string) {
  console.log(`Deleting ${table} rows for userId:`, userId);
  const { error } = await admin.from(table).delete().eq("user_id", userId);

  if (error) {
    if (isMissingTableError(error)) {
      console.log(`Skipping ${table} cleanup because table does not exist`);
      return;
    }

    console.log(`${table} deletion error:`, error);
    throw new Error(`${table}: ${error.message}`);
  }

  console.log(`${table} rows deleted successfully`);
}

async function nullUserIdRows(admin: any, table: string, userId: string) {
  console.log(`Nulling ${table}.user_id rows for userId:`, userId);
  const { error } = await admin
    .from(table)
    .update({ user_id: null })
    .eq("user_id", userId);

  if (error) {
    if (isMissingTableError(error)) {
      console.log(`Skipping ${table} cleanup because table does not exist`);
      return;
    }

    console.log(`${table} user_id nulling error:`, error);
    throw new Error(`${table}: ${error.message}`);
  }

  console.log(`${table}.user_id nulled successfully`);
}

serve(async (req) => {
  try {
    console.log("Account delete function called");

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.log("Missing Authorization header");
      return jsonResponse({ success: false, error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    console.log("Token received (first 50 chars):", token.substring(0, 50));

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.log("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return jsonResponse(
        {
          success: false,
          error: "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
        },
        500
      );
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    console.log("Admin client created");

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    const userId = userData?.user?.id;

    if (userError || !userId) {
      console.log("Could not verify user from token:", userError);
      return jsonResponse(
        {
          success: false,
          step: "verify_user",
          error: userError?.message ?? "Could not verify user from token",
        },
        401
      );
    }

    console.log("Verified userId:", userId);

    console.log("Checking owned trucks for userId:", userId);
    const { data: ownedTrucks, error: ownedTrucksError } = await admin
      .from("trucks")
      .select("id, name")
      .eq("owner_id", userId);

    if (ownedTrucksError) {
      console.log("Owned trucks lookup error:", ownedTrucksError);
      return jsonResponse(
        {
          success: false,
          step: "owned_trucks",
          error: ownedTrucksError.message,
        },
        500
      );
    }

    if (ownedTrucks && ownedTrucks.length > 0) {
      console.log("Account deletion blocked because user owns trucks:", ownedTrucks);
      return jsonResponse(
        {
          success: false,
          step: "owned_trucks",
          error: TRUCK_OWNER_DELETE_MESSAGE,
          ownedTruckIds: ownedTrucks.map((truck: any) => truck.id),
          ownedTruckNames: ownedTrucks.map((truck: any) => truck.name),
        },
        409
      );
    }

    await deleteRows(admin, "favorites", userId);
    await deleteRows(admin, "truck_checkins", userId);
    await deleteRows(admin, "owner_message_reads", userId);
    await deleteRows(admin, "reviews", userId);
    await nullUserIdRows(admin, "sightings", userId);
    await nullUserIdRows(admin, "analytics_events", userId);

    // Delete profile
    console.log("Deleting profile for userId:", userId);
    const { error: profileError } = await admin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) {
      console.log("Profile deletion error:", profileError);
      return jsonResponse(
        {
          success: false,
          step: "profiles",
          error: profileError.message,
        },
        500
      );
    }
    console.log("Profile deleted successfully");

    // Delete auth user
    console.log("Deleting auth user:", userId);
    const { error: authDeleteError } = await admin.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      console.log("Auth delete error:", authDeleteError);
      return jsonResponse(
        {
          success: false,
          step: "auth",
          error: authDeleteError.message,
        },
        500
      );
    }
    console.log("Auth user deleted successfully");

    console.log("Account deletion completed successfully for userId:", userId);
    return jsonResponse(
      {
        success: true,
        userId,
      },
      200
    );
  } catch (error) {
    console.log("Unexpected error:", error);
    const message = error instanceof Error ? error.message : String(error);
    const [step, ...rest] = message.split(": ");
    const hasStep = rest.length > 0;

    return jsonResponse(
      {
        success: false,
        step: hasStep ? step : "unexpected",
        error: hasStep ? rest.join(": ") : message,
      },
      500
    );
  }
});
