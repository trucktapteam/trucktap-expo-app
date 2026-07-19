import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TRUCK_OWNER_DELETE_MESSAGE =
  "This account owns a food truck profile. Please contact TruckTap support to transfer or remove the truck before deleting your account.";

const jsonResponse = (body: Record<string, unknown>, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  try {
    console.log("Account delete function called");

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      console.log("Missing Authorization header");
      return jsonResponse({ success: false, error: "Missing Authorization header" }, 401);
    }

    const token = authHeader.replace(/^Bearer\s+/i, "").trim();

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

    const { data: deletionResult, error: deletionError } = await admin.rpc(
      "delete_customer_account",
      { p_user_id: userId },
    );

    if (deletionError) {
      console.log("Atomic account deletion failed:", {
        userId,
        code: deletionError.code,
      });
      return jsonResponse(
        {
          success: false,
          step: "delete_account",
          error: "Account deletion could not be completed.",
        },
        500
      );
    }

    if (deletionResult?.reason === "owns_truck") {
      return jsonResponse(
        {
          success: false,
          step: "owned_trucks",
          error: TRUCK_OWNER_DELETE_MESSAGE,
        },
        409,
      );
    }

    if (deletionResult?.success !== true) {
      return jsonResponse(
        {
          success: false,
          step: "delete_account",
          error: "Account deletion could not be completed.",
        },
        deletionResult?.reason === "user_not_found" ? 404 : 500,
      );
    }

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
