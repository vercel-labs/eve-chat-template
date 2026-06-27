#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REQUIRED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "BLOB_READ_WRITE_TOKEN",
];

const OPTIONAL = [
  "BETTER_AUTH_URL",
  "SLACK_CONNECTOR",
  "LINEAR_CONNECTOR",
  "NOTION_CONNECTOR",
  "SENTRY_CONNECTOR",
];

const envPath = resolve(process.cwd(), ".env.local");

async function loadEnvFile() {
  try {
    const content = await readFile(envPath, "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const [rawKey, ...rawValue] = trimmed.split("=");
      const key = rawKey?.trim();
      const value = rawValue.join("=").trim().replace(/^["']|["']$/g, "");
      if (key) env[key] = value;
    }
    return env;
  } catch {
    return null;
  }
}

function isSet(value) {
  return Boolean(value && value.trim() && !value.startsWith("YOUR_"));
}

const env = await loadEnvFile();

if (!env) {
  console.error("❌ .env.local not found.");
  console.error("   Run: vercel env pull .env.local --yes");
  process.exit(1);
}

let missing = 0;

for (const key of REQUIRED) {
  if (!isSet(env[key])) {
    console.error(`❌ Missing required env var: ${key}`);
    missing++;
  }
}

for (const key of OPTIONAL) {
  if (!isSet(env[key])) {
    console.warn(`⚠️  Optional env var not set: ${key}`);
  }
}

if (missing > 0) {
  console.error(`\n${missing} required variable(s) missing.`);
  console.error("See SETUP.md for how to provision them.");
  process.exit(1);
}

console.log("✅ All required environment variables are present.");
