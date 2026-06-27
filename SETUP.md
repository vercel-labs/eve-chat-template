# Setup Checklist

One-time setup for the team to run the eve chat template locally.

## Prerequisites

- Node.js 24 or newer
- pnpm 10.12.4 (via Corepack)
- Vercel CLI: `pnpm dlx vercel@latest login`

## Steps

1. **Install dependencies**

   ```bash
   corepack enable
   pnpm install
   ```

2. **Link the Vercel project**

   ```bash
   vercel link
   ```

3. **Provision required storage**

   ```bash
   vercel integration add neon
   vercel integration add upstash
   ```

4. **Pull environment variables**

   ```bash
   vercel env pull .env.local --yes
   ```

5. **Validate environment variables**

   ```bash
   pnpm env:validate
   ```

6. **Run migrations**

   ```bash
   set -a
   source .env.local
   set +a
   pnpm db:migrate
   ```

7. **Start the dev server**

   ```bash
   pnpm dev
   ```

## Required environment variables

See `.env.example` for the full list. At minimum:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `NEXT_PUBLIC_VERCEL_APP_CLIENT_ID`
- `VERCEL_APP_CLIENT_SECRET`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

## Optional integrations

- `SLACK_CONNECTOR`
- `LINEAR_CONNECTOR`
- `NOTION_CONNECTOR`
- `SENTRY_CONNECTOR`

## CI

Every PR runs `pnpm typecheck` and `pnpm build` via GitHub Actions.

## Common issues

- **Missing migrations**: run `pnpm db:migrate`
- **OAuth sign-in fails**: verify the Vercel app has `email` scope and the callback URL matches your origin
- **Chat is disabled**: run `pnpm env:validate` to see which env var is missing
