export const DATABASE_NOTIFICATION_SECRET_ENV =
  "DATABASE_NOTIFICATION_WEBHOOK_SECRET";
export const DATABASE_NOTIFICATION_SECRET_HEADER =
  "x-trucktap-webhook-secret";

export const secretsMatch = async (
  provided: string,
  expected: string,
): Promise<boolean> => {
  const encoder = new TextEncoder();
  const [providedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  const left = new Uint8Array(providedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }
  return difference === 0;
};

export const authorizeDatabaseNotificationWebhook = async (
  request: Request,
  expectedSecret: string,
): Promise<Response | null> => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const providedSecret =
    request.headers.get(DATABASE_NOTIFICATION_SECRET_HEADER) ?? "";
  if (
    !expectedSecret ||
    !providedSecret ||
    !(await secretsMatch(providedSecret, expectedSecret))
  ) {
    return new Response("Unauthorized", { status: 401 });
  }

  return null;
};

export const getBearerToken = (request: Request): string | null => {
  const authorization = request.headers.get("authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
};

export const canSendTruckAnnouncement = (
  userId: string,
  truckOwnerId: string | null | undefined,
  profileRole: string | null | undefined,
): boolean =>
  truckOwnerId === userId || profileRole === "admin";
