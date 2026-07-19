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

const SECRET_ENV = "HANDS_FREE_LIVE_WEBHOOK_SECRET";
const SECRET_HEADER = "x-trucktap-webhook-secret";
const TEST_SECRET = "local-hands-free-live-test-secret";

const request = (secret?: string, body: unknown = {}) => {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (secret) headers.set(SECRET_HEADER, secret);
  return new Request(
    "http://localhost/functions/v1/notify-hands-free-live-transition",
    {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    },
  );
};

Deno.test("rejects a missing confirmation webhook secret", async () => {
  Deno.env.set(SECRET_ENV, TEST_SECRET);
  const response = await handler(request());
  assertEquals(response.status, 401);
  assertEquals(await response.text(), "Unauthorized");
});

Deno.test("rejects an incorrect confirmation webhook secret", async () => {
  Deno.env.set(SECRET_ENV, TEST_SECRET);
  const response = await handler(request("incorrect-secret"));
  assertEquals(response.status, 401);
});

Deno.test("rejects requests when the expected secret is absent", async () => {
  Deno.env.delete(SECRET_ENV);
  const response = await handler(request(TEST_SECRET));
  assertEquals(response.status, 401);
});

Deno.test("valid secret reaches payload validation", async () => {
  Deno.env.set(SECRET_ENV, TEST_SECRET);
  const response = await handler(request(TEST_SECRET, { event_id: "invalid" }));
  assertEquals(response.status, 400);
  assertEquals(await response.text(), "Invalid event");
});
