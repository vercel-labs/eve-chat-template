import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db/client";

const vercelClientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID?.trim() ?? "";
const vercelClientSecret = process.env.VERCEL_APP_CLIENT_SECRET?.trim() ?? "";
const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();
const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim();
const vercelProviderConfigured = Boolean(betterAuthSecret && vercelClientId && vercelClientSecret);
const betterAuthHost = getUrlHost(betterAuthUrl);

export const auth = betterAuth({
  baseURL: {
    allowedHosts: [
      "localhost:3000",
      "localhost:3001",
      "127.0.0.1:3000",
      "127.0.0.1:3001",
      "*.vercel.app",
      process.env.VERCEL_URL,
      betterAuthHost,
    ].filter((host): host is string => Boolean(host)),
    fallback: betterAuthUrl ?? "http://localhost:3000",
    protocol: process.env.NODE_ENV === "production" ? "https" : "http",
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["vercel"],
      allowDifferentEmails: true,
    },
  },
  secret: betterAuthSecret ?? "eve-chat-template-unconfigured-secret",
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  onAPIError: {
    errorURL: "/auth/error",
  },
  socialProviders: vercelProviderConfigured
    ? {
        vercel: {
          clientId: vercelClientId,
          clientSecret: vercelClientSecret,
          overrideUserInfoOnSignIn: true,
        },
      }
    : {},
  plugins: [nextCookies()],
});

function getUrlHost(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}
