// @ts-ignore Deno resolves JSR imports in the Edge Function test runtime.
import { assertEquals } from "jsr:@std/assert@1";
// @ts-ignore Deno permits explicit TypeScript module extensions.
import { handler } from "./index.ts";

declare const Deno: {
  test: (name: string, fn: () => void | Promise<void>) => void;
  env: {
    set: (key: string, value: string) => void;
    delete: (key: string) => void;
  };
};

const SECRET_ENV = "FAVORITE_TRUCK_OPEN_WEBHOOK_SECRET";
const SECRET_HEADER = "x-trucktap-webhook-secret";
const TEST_SECRET = "local-test-favorite-webhook-secret";

const request = (secret?: string, body: unknown = {}): Request => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret !== undefined) headers.set(SECRET_HEADER, secret);
  return new Request(
    "http://localhost/functions/v1/notify-favorite-truck-open",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );
};

Deno.test("rejects a missing webhook secret", async () => {
  Deno.env.set(SECRET_ENV, TEST_SECRET);
  const response = await handler(request());
  assertEquals(response.status, 401);
  assertEquals(await response.text(), "Unauthorized");
});

Deno.test("rejects an incorrect webhook secret", async () => {
  Deno.env.set(SECRET_ENV, TEST_SECRET);
  const response = await handler(request("incorrect-local-test-secret"));
  assertEquals(response.status, 401);
  assertEquals(await response.text(), "Unauthorized");
});

Deno.test("rejects requests when the expected secret is not configured", async () => {
  Deno.env.delete(SECRET_ENV);
  const response = await handler(request(TEST_SECRET));
  assertEquals(response.status, 401);
  assertEquals(await response.text(), "Unauthorized");
});

Deno.test("accepts a valid secret and preserves the database webhook payload", async () => {
  Deno.env.set(SECRET_ENV, TEST_SECRET);
  const response = await handler(request(TEST_SECRET, {
    type: "UPDATE",
    table: "trucks",
    schema: "public",
    record: {
      id: "10000000-0000-0000-0000-000000000001",
      name: "Local Test Truck",
      is_open: false,
    },
    old_record: {
      id: "10000000-0000-0000-0000-000000000001",
      name: "Local Test Truck",
      is_open: false,
    },
  }));
  assertEquals(response.status, 200);
  assertEquals(await response.text(), "Skipped");
});
