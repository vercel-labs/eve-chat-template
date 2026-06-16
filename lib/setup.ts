import type { SetupStatus } from "@/lib/chat/types";
import { isDatabaseConfigured } from "@/lib/db/client";

const AUTH_ENV_KEYS = [
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
] as const;

const RATE_LIMIT_ENV_GROUPS = [
  ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"],
  ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
] as const;

function hasEnv(name: string) {
  return Boolean(process.env[name]?.trim());
}

export function isAuthConfigured() {
  return AUTH_ENV_KEYS.every(hasEnv);
}

export function isRateLimitConfigured() {
  return RATE_LIMIT_ENV_GROUPS.some((group) => group.every(hasEnv));
}

export function getSetupStatus(): SetupStatus {
  const missing = [
    ...(isDatabaseConfigured() ? [] : ["DATABASE_URL"]),
    ...AUTH_ENV_KEYS.filter((key) => !hasEnv(key)),
  ];

  return {
    authReady: isAuthConfigured(),
    databaseReady: isDatabaseConfigured(),
    missing,
    rateLimitReady: isRateLimitConfigured(),
  };
}

export function isAppConfigured() {
  const status = getSetupStatus();

  return status.authReady && status.databaseReady;
}
