# Setup and Deployment

This guide covers a full local setup and a production deployment for Eve Chat Template.

## Prerequisites

- Node.js 24 or newer
- pnpm through Corepack
- A Vercel account with access to the team that will own the project
- Vercel CLI, either installed globally or run with `pnpm dlx`

```bash
corepack enable
pnpm install
pnpm dlx vercel@latest login
```

The commands below use `vercel`. If you do not have a global Vercel CLI install, replace `vercel` with `pnpm dlx vercel@latest`.

## 1. Link the Vercel Project

Create or select the Vercel project that will run this template:

```bash
vercel link
```

If you are working in the Vercel Labs team, pass the team scope:

```bash
vercel link --scope vercel-labs
```

Pull the first local environment file:

```bash
vercel env pull .env.local --yes
```

## 2. Provision Neon Postgres

Neon is mandatory. Chat history, auth records, Eve session state, and message snapshots are stored in Postgres through Drizzle.

Provision Neon from Vercel Marketplace:

```bash
vercel integration add neon
```

Follow the prompts and connect the Neon resource to this Vercel project. Then pull env vars again:

```bash
vercel env pull .env.local --yes
```

Confirm that `.env.local` contains:

```bash
DATABASE_URL=
```

## 3. Add Better Auth Secret

Generate a production-safe secret:

```bash
openssl rand -base64 32
```

Add it to every Vercel environment:

```bash
printf '%s' "<generated-secret>" | vercel env add BETTER_AUTH_SECRET production preview development
```

Then add the same value to `.env.local`, or pull it back down:

```bash
vercel env pull .env.local --yes
```

For hosted deployments, set the Better Auth URL to the app origin:

```bash
printf '%s' "https://<your-production-domain>" | vercel env add BETTER_AUTH_URL production preview development
vercel env pull .env.local --yes
```

## 4. Create Sign in with Vercel Credentials

This template uses Better Auth with the Vercel OAuth provider. Follow the [Sign in with Vercel prerequisites](https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites), then create a Vercel App / OAuth client in the Vercel dashboard for the account or team that owns the project.

Set the callback URLs to the Better Auth Vercel callback route:

```text
http://localhost:3000/api/auth/callback/vercel
http://localhost:3001/api/auth/callback/vercel
https://<your-production-domain>/api/auth/callback/vercel
```

Use the `3001` callback only if you run local dev on port 3001. If you deploy first on the generated Vercel domain, add:

```text
https://<your-project>.vercel.app/api/auth/callback/vercel
```

Copy the client ID and client secret from the Vercel App, then add them to Vercel:

```bash
printf '%s' "<client-id>" | vercel env add NEXT_PUBLIC_VERCEL_APP_CLIENT_ID production preview development
printf '%s' "<client-secret>" | vercel env add VERCEL_APP_CLIENT_SECRET production preview development
```

Pull the updated values locally:

```bash
vercel env pull .env.local --yes
```

`NEXT_PUBLIC_VERCEL_APP_CLIENT_ID` is intentionally public. `VERCEL_APP_CLIENT_SECRET` and `BETTER_AUTH_SECRET` must stay secret.

## 5. Optional: Provision Upstash Redis

Upstash Redis enables Redis-backed rate limiting for authenticated chat sends. If these env vars are missing, the app runs without Redis rate limiting.

Provision Upstash from Vercel Marketplace:

```bash
vercel integration add upstash
```

Follow the prompts, connect the resource to this project, and pull env vars:

```bash
vercel env pull .env.local --yes
```

The optional env vars are:

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Some Vercel Upstash Redis resources use Vercel KV-compatible env names. The app supports those too:

```bash
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

## 6. Optional: Provision Notion Connect

Notion support uses Vercel Connect and the MCP connection in `agent/connections/notion.ts`.

Create the connector:

```bash
vercel connect create mcp.notion.com --name notion
```

Attach it to the linked Vercel project if needed:

```bash
vercel connect attach <connector-uid> --yes
```

Set `NOTION_CONNECTOR` to the connector UID for template clones and deployments:

```bash
printf '%s' "<connector-uid>" | vercel env add NOTION_CONNECTOR production preview development
vercel env pull .env.local --yes
```

For local development, the connection falls back to `notion`, so a local connector created with `--name notion` can work without editing `agent/connections/notion.ts`.

## 7. Verify Environment Variables

Required:

```bash
DATABASE_URL=
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=
NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=
VERCEL_APP_CLIENT_SECRET=
```

Optional rate limiting:

```bash
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

Optional Notion integration:

```bash
NOTION_CONNECTOR=
```

## 8. Create Database Tables

Drizzle Kit does not automatically load `.env.local`, so export the env vars before running migrations:

```bash
set -a
source .env.local
set +a
pnpm db:migrate
```

For local prototyping only, you can use:

```bash
set -a
source .env.local
set +a
pnpm db:push
```

## 9. Run Locally

Start the app:

```bash
pnpm dev
```

Or run it on port 3001:

```bash
PORT=3001 pnpm dev -p 3001
```

Open the matching local URL and make sure the Vercel App contains the same callback URL:

```text
http://localhost:3000/api/auth/callback/vercel
http://localhost:3001/api/auth/callback/vercel
```

## 10. Deploy

Build locally before the first production deploy:

```bash
pnpm build
```

Deploy to Vercel production:

```bash
vercel --prod
```

After changing env vars, storage products, or Connect connectors, redeploy so production uses the newest project configuration.

## One-Click Deploy

You can also use the deploy button in the README. It provisions Neon and Upstash Redis through Vercel Marketplace, provisions `NOTION_CONNECTOR` through Vercel Connect for Notion, and asks for the Better Auth and Sign in with Vercel env vars during the clone flow.

After the clone finishes:

```bash
vercel env pull .env.local --yes
set -a
source .env.local
set +a
pnpm db:migrate
pnpm dev
```

## Troubleshooting

If chat is disabled, check that `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_VERCEL_APP_CLIENT_ID`, and `VERCEL_APP_CLIENT_SECRET` are present in `.env.local`, then restart `pnpm dev`.

If sign-in redirects to an auth error, confirm that the Vercel App callback URL exactly matches the URL you are using in the browser, including the port and `/api/auth/callback/vercel` path.

If `pnpm db:migrate` says `DATABASE_URL` is missing, re-run it after sourcing `.env.local`.

If Notion tool calls fail, confirm that `NOTION_CONNECTOR` is set in Vercel, the connector is attached to the project, and local env vars have been pulled again.

## Useful Links

- [Vercel CLI](https://vercel.com/docs/cli)
- [Vercel environment variables](https://vercel.com/docs/environment-variables)
- [Vercel Marketplace storage](https://vercel.com/docs/storage)
- [Sign in with Vercel prerequisites](https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites)
