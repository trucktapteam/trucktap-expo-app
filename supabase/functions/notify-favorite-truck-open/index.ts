// @ts-ignore Deno resolves npm: imports at the edge runtime.
import { createClient } from "npm:@supabase/supabase-js@2";

declare const Deno: {
  serve: (handler: (req: Request) => Response | Promise<Response>) => void;
  env: {
    get: (key: string) => string | undefined;
  };
};

type FavoriteRow = {
  user_id: string | null;
};

type ProfileRow = {
  id: string;
  push_token: string | null;
  notify_favorites_open: boolean | null;
};

type ValidProfileRow = ProfileRow & {
  push_token: string;
};

type ExpoTicket = {
  status?: "ok" | "error";
  message?: string;
  details?: {
    error?: string;
  };
};

const isValidExpoPushToken = (token: unknown): token is string => {
  if (typeof token !== "string") return false;
  const trimmed = token.trim();
  return /^(ExpoPushToken|ExponentPushToken)\[[^\]]+\]$/.test(trimmed);
};

const hasValidExpoPushToken = (profile: ProfileRow): profile is ValidProfileRow =>
  isValidExpoPushToken(profile.push_token);

Deno.serve(async (req: Request) => {
  const startedAt = Date.now();

  try {
    const payload = await req.json();
    const record = payload.record;
    const oldRecord = payload.old_record;

    if (!record) {
      return new Response("Missing record");
    }

    const wasOpen = oldRecord?.is_open === true;
    const isOpenNow = record.is_open === true;
    const truckId = record.id;
    const truckName = record.name ?? "A favorite truck";

    if (!isOpenNow || wasOpen === true) {
      console.log("Favorite truck open notification skipped:", {
        truckId,
        truckName,
        oldIsOpen: oldRecord?.is_open ?? null,
        newIsOpen: record.is_open ?? null,
        durationMs: Date.now() - startedAt,
      });
      return new Response("Skipped");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: favorites, error: favoritesError } = await supabase
      .from("favorites")
      .select("user_id")
      .eq("truck_id", truckId);

    if (favoritesError) {
      console.log("Favorites query error:", {
        truckId,
        truckName,
        error: favoritesError.message,
        durationMs: Date.now() - startedAt,
      });
      return new Response(favoritesError.message, { status: 500 });
    }

    const userIds = ((favorites ?? []) as FavoriteRow[])
      .map((favorite: FavoriteRow) => favorite.user_id)
      .filter(Boolean);

    if (userIds.length === 0) {
      console.log("Favorite truck open notification summary:", {
        truckId,
        truckName,
        oldIsOpen: oldRecord?.is_open ?? null,
        newIsOpen: record.is_open ?? null,
        usersFound: 0,
        validTokens: 0,
        invalidTokens: 0,
        expoAccepted: 0,
        expoRejected: 0,
        staleTokensCleared: 0,
        durationMs: Date.now() - startedAt,
      });
      return new Response("No users", { status: 200 });
    }

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, push_token, notify_favorites_open")
      .in("id", userIds)
      .eq("notify_favorites_open", true);

    if (profilesError) {
      console.log("Profiles query error:", {
        truckId,
        truckName,
        usersFound: userIds.length,
        error: profilesError.message,
        durationMs: Date.now() - startedAt,
      });
      return new Response(profilesError.message, { status: 500 });
    }

    const tokenRows = (profiles ?? []) as ProfileRow[];
    const validTokenRows = tokenRows.filter(hasValidExpoPushToken);
    const invalidTokenRows = tokenRows.filter((profile: ProfileRow) => !hasValidExpoPushToken(profile));
    let invalidTokensCleared = 0;

    if (invalidTokenRows.length > 0) {
      const invalidTokenCleanup = await supabase
        .from("profiles")
        .update({ push_token: null })
        .in("id", invalidTokenRows.map((profile: ProfileRow) => profile.id));

      if (invalidTokenCleanup.error) {
        console.log("Invalid push token cleanup failed:", {
          truckId,
          truckName,
          attempted: invalidTokenRows.length,
          error: invalidTokenCleanup.error.message,
        });
      } else {
        invalidTokensCleared = invalidTokenRows.length;
      }
    }

    if (validTokenRows.length === 0) {
      console.log("Favorite truck open notification summary:", {
        truckId,
        truckName,
        oldIsOpen: oldRecord?.is_open ?? null,
        newIsOpen: record.is_open ?? null,
        usersFound: userIds.length,
        validTokens: 0,
        invalidTokens: invalidTokenRows.length,
        expoAccepted: 0,
        expoRejected: 0,
        staleTokensCleared: invalidTokensCleared,
        durationMs: Date.now() - startedAt,
      });
      return new Response("No tokens", { status: 200 });
    }

    const messages = validTokenRows.map((profile: ValidProfileRow) => ({
      to: profile.push_token.trim(),
      sound: "default",
      title: `${truckName} is open`,
      body: `${truckName} just opened`,
      data: { truckId, truck_id: truckId },
    }));

    const expoResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    const expoJson = await expoResponse.json();
    const tickets = (Array.isArray(expoJson?.data) ? expoJson.data : []) as ExpoTicket[];
    const expoAccepted = tickets.filter((ticket: ExpoTicket) => ticket?.status === "ok").length;
    const expoRejected = tickets.filter((ticket: ExpoTicket) => ticket?.status === "error").length;

    const staleTokenRows = tickets
      .map((ticket: ExpoTicket, index: number) => ({ ticket, profile: validTokenRows[index] }))
      .filter(({ ticket, profile }: { ticket: ExpoTicket; profile?: ProfileRow }) => {
        if (!profile || ticket?.status !== "error") return false;
        const detailError = ticket?.details?.error;
        const message = typeof ticket?.message === "string" ? ticket.message.toLowerCase() : "";
        return detailError === "DeviceNotRegistered" || message.includes("not a registered push notification recipient");
      })
      .map(({ profile }: { ticket: ExpoTicket; profile?: ProfileRow }) => profile)
      .filter((profile: ProfileRow | undefined): profile is ProfileRow => Boolean(profile));

    let staleTokensCleared = invalidTokensCleared;

    if (staleTokenRows.length > 0) {
      const staleTokenCleanup = await supabase
        .from("profiles")
        .update({ push_token: null })
        .in("id", staleTokenRows.map((profile: ProfileRow) => profile.id));

      if (staleTokenCleanup.error) {
        console.log("Stale push token cleanup failed:", {
          truckId,
          truckName,
          attempted: staleTokenRows.length,
          error: staleTokenCleanup.error.message,
        });
      } else {
        staleTokensCleared += staleTokenRows.length;
      }
    }

    console.log("Favorite truck open notification summary:", {
      truckId,
      truckName,
      oldIsOpen: oldRecord?.is_open ?? null,
      newIsOpen: record.is_open ?? null,
      usersFound: userIds.length,
      validTokens: validTokenRows.length,
      invalidTokens: invalidTokenRows.length,
      expoStatus: expoResponse.status,
      expoAccepted,
      expoRejected,
      staleDeviceTokens: staleTokenRows.length,
      staleTokensCleared,
      durationMs: Date.now() - startedAt,
    });

    return new Response("Notifications sent", { status: 200 });
  } catch (err) {
    console.log("Unexpected function error:", {
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - startedAt,
    });
    return new Response("Function crashed", { status: 500 });
  }
});
