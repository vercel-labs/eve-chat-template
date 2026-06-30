# Setup and Deployment

This guide covers local development, one-click deployment, production migrations, Sign in with Vercel, and optional Notion connections for eve Chat Template.

## Prerequisites

- Node.js 24 or newer
- pnpm through Corepack
- A Vercel account with access to the team that owns the project
- Vercel CLI, either installed globally or run with `pnpm dlx`

```bash
corepack enable
pnpm install
pnpm dlx vercel@latest login
```

The commands below use `vercel`. If you do not have a global install, replace `vercel` with `pnpm dlx vercel@latest`.

## One-Click Deploy

The README deploy button provisions the required storage products through Vercel Marketplace:

- Neon Postgres, which provides `DATABASE_URL`
- Upstash Redis, which provides rate-limit storage env vars

The deploy flow asks for:

```bash
BETTER_AUTH_SECRET=
NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=
VERCEL_APP_CLIENT_SECRET=
```

After the first production deployment is created, run migrations against the production environment:

```bash
vercel env run -e production -- pnpm db:migrate
```

This uses Vercel production env vars directly and avoids copying sensitive Neon values into your terminal or local files.

## Local Project Link

Create or select the Vercel project that will run this template:

```bash
vercel link
```

If you are working in a team, pass the team scope:

```bash
vercel link --scope <team-slug>
```

## Required Storage

Neon and Upstash Redis are required for the template.

Provision Neon:

```bash
vercel integration add neon
```

Provision Upstash Redis:

```bash
vercel integration add upstash
```

Follow the prompts and connect both resources to the linked project.

When Neon is created through the import flow, `DATABASE_URL` is usually marked sensitive and applied to Production and Preview. That is fine for deployed migrations with `vercel env run`. Select Development for the Neon env var only if you want `DATABASE_URL` to be pulled into `.env.local`; selecting Development will make it available to local dev.

Pull local env vars if you are running the app locally:

```bash
vercel env pull .env.local --yes
```

## Better Auth Secret

Generate a production-safe secret:

```bash
openssl rand -base64 32
```

Add it to every Vercel environment:

```bash
printf '%s' "<generated-secret>" | vercel env add BETTER_AUTH_SECRET production preview development
```

Pull the value locally if needed:

```bash
vercel env pull .env.local --yes
```

## Sign in with Vercel

Create a Vercel App / OAuth client in the Vercel dashboard for the account or team that owns the project. Start with the [Sign in with Vercel prerequisites](https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites).

Required scopes:

```text
openid
email
profile
```

In the Vercel App dashboard UI, open the app's scopes/permissions settings and toggle all three scopes on. These are Vercel App permissions, not environment variables.

The email scope is mandatory. Without it, Better Auth redirects to:

```text
/auth/error?error=email_not_found
```

Add callback URLs for every origin you will use:

```text
http://localhost:3000/api/auth/callback/vercel
http://localhost:3001/api/auth/callback/vercel
https://<your-project-production-domain>/api/auth/callback/vercel
https://<your-custom-domain>/api/auth/callback/vercel
```

Use the `3001` callback only if you run local dev on port 3001. Add custom-domain callbacks only after you know the domain.

Copy the Vercel App client ID and client secret, then add them:

```bash
printf '%s' "<client-id>" | vercel env add NEXT_PUBLIC_VERCEL_APP_CLIENT_ID production preview development
printf '%s' "<client-secret>" | vercel env add VERCEL_APP_CLIENT_SECRET production preview development
```

Pull the updated values locally:

```bash
vercel env pull .env.local --yes
```

`NEXT_PUBLIC_VERCEL_APP_CLIENT_ID` is intentionally public. `VERCEL_APP_CLIENT_SECRET` and `BETTER_AUTH_SECRET` must stay secret.

You can create the OAuth app from the CLI:

```bash
vercel oauth-apps register \
  --name "eve Chat Template" \
  --slug "eve-chat-template" \
  --redirect-uri "https://<your-project-production-domain>/api/auth/callback/vercel"
```

After using the CLI, verify scopes and the client secret in the Vercel dashboard before relying on sign-in. See the [OAuth Apps CLI docs](https://vercel.com/docs/cli/oauth-apps).

## App URL

The app derives the auth origin in this order:

```text
BETTER_AUTH_URL -> VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL -> http://localhost:3000
```

You usually do not need `BETTER_AUTH_URL` for the first Vercel deployment. Set it explicitly when you use a custom production domain:

```bash
printf '%s' "https://<your-custom-domain>" | vercel env add BETTER_AUTH_URL production preview development
```

`VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` are Vercel system env vars. See [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

## Database Migrations

Run production migrations after the first deployment and after any schema change:

```bash
vercel env run -e production -- pnpm db:migrate
```

There is also a package script:

```bash
pnpm db:migrate:production
```

For local development, load `.env.local` before running Drizzle:

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

See the [Vercel env run docs](https://vercel.com/docs/cli/env) for more examples.

## Run Locally

Start the app:

```bash
pnpm dev
```

Or run it on port 3001:

```bash
PORT=3001 pnpm dev -p 3001
```

Open the matching local URL and make sure the Vercel App contains the same callback URL.

## Optional Vercel Connect Integrations

Slack, Notion, Linear, and Sentry are optional and are not part of the required deploy button flow.

Create any connectors you want to use:

```bash
# Slack channel
vercel connect create slack --name eve-chat-template --triggers
vercel connect attach <slack-connector-uid> --triggers --trigger-path /eve/v1/slack --yes

# MCP connections
vercel connect create mcp.notion.com --name notion
vercel connect create https://mcp.linear.app/mcp --name linear
vercel connect create https://mcp.sentry.dev/mcp --name sentry
```

Attach it to the linked Vercel project if needed:

```bash
vercel connect attach <connector-uid> --yes
```

Set the matching environment variable to each connector UID:

```bash
printf '%s' "<slack-connector-uid>" | vercel env add SLACK_CONNECTOR production preview development
printf '%s' "<connector-uid>" | vercel env add NOTION_CONNECTOR production preview development
printf '%s' "<connector-uid>" | vercel env add LINEAR_CONNECTOR production preview development
printf '%s' "<connector-uid>" | vercel env add SENTRY_CONNECTOR production preview development
vercel env pull .env.local --yes
```

For local development, the connections fall back to `slack/eve-chat-template`, `notion`, `linear`, and `sentry`, so local connectors created with the names above can work without editing files under `agent/`.

If a chat requires MCP authorization, use the Connect card in the chat UI. If you want to manage a connector directly, open the project integrations/settings page in Vercel and find the connector.

See [Deploy Button integrations](https://vercel.com/docs/integrations/deploy-button/integrations) for how storage products are declared in the deploy URL.

## Deploy

Build locally before deploying:

```bash
pnpm build
```

Deploy to production:

```bash
vercel --prod
```

After changing env vars, storage products, or Connect connectors, redeploy so production uses the newest project configuration.

## Troubleshooting

If chat is disabled and says setup is required, check the tooltip. Missing migrations will show as `database migrations`. Run:

```bash
vercel env run -e production -- pnpm db:migrate
```

If sign-in redirects to `/auth/error?error=email_not_found`, enable the email scope in your Vercel App. See [Sign in with Vercel scopes](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions).

If sign-in redirects to `/auth/error?error=invalid_scope`, make sure the Vercel App has `openid`, `email`, and `profile` enabled.

If sign-in redirects to an auth error after the OAuth consent screen, confirm that the callback URL exactly matches your browser origin, including port and `/api/auth/callback/vercel`.

If `pnpm db:migrate` says `DATABASE_URL` is missing, either run `vercel env run -e production -- pnpm db:migrate` for production or pull a Development-scoped Neon env var into `.env.local`.

If rate limiting setup is missing, provision Upstash Redis and pull env vars again.

If Notion tool calls fail, confirm that `NOTION_CONNECTOR` is set in Vercel, the connector is attached to the project, and local env vars have been pulled again.

If the dev logs show `Vercel CLI: The specified token is not valid`, it comes from the optional Vercel Connect integrations (Slack, Notion, Linear, Sentry) trying to reach Vercel during local development. It does not block chat, tasks, projections, or auth. To silence it, run `pnpm dlx vercel@latest login` and `vercel link` so the CLI has a valid token, or simply ignore it if you are not using those connectors locally. In production, the Vercel deployment authenticates these connections automatically through OIDC.

## Useful Links

- [Vercel CLI](https://vercel.com/docs/cli)
- [Vercel env run](https://vercel.com/docs/cli/env)
- [Vercel Marketplace storage](https://vercel.com/docs/storage)
- [Vercel CLI integration commands](https://vercel.com/docs/cli/integration)
- [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Sign in with Vercel prerequisites](https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites)
- [Sign in with Vercel scopes](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions)
