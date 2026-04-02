import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;

  if (!url) {
    console.warn("[trpc] EXPO_PUBLIC_RORK_API_BASE_URL is not set. Using fallback.");
    return "https://api.rivet.dev";
  }

  return url;
};

const baseUrl = getBaseUrl();

console.log("[trpc] Base URL:", baseUrl);
console.log("[trpc] Full tRPC URL:", `${baseUrl}/api/trpc`);

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${baseUrl}/api/trpc`,
      transformer: superjson,
    }),
  ],
});