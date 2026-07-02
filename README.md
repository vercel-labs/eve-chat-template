# independent-eve

A self-running, plugin-open Next.js chat agent built on [eve](https://beta.eve.dev). It works end-to-end on its own data (tasks, memories, documents, audit trail) through local defaults, while staying open to the world through the same connector architecture as Notion, Linear, and Sentry.

Built with shadcn/ui, Tailwind CSS, Streamdown, Better Auth, Drizzle, Neon, and Upstash Redis.

## Quick Start

Two ways to get going:

- **One-click:** use the **Deploy with Vercel** button to clone and provision storage, then run migrations (see [Setup and Deployment](docs/setup-and-deploy.md#one-click-deploy)).
- **Local script:** clone the repo and run the setup script. It links the project, provisions Neon, registers the Sign in with Vercel OAuth app (email scope + callbacks), sets the environment variables through the Vercel API, pulls them locally, runs migrations, and can optionally set up connectors. If OAuth app registration isn't available it falls back to a guided manual flow.

```bash
# Uses the linked project's team by default
./scripts/setup.sh

# Or target a specific team (also accepts a bare team slug)
./scripts/setup.sh --scope <team-slug>
```

The `--scope` is optional; omit it to use the linked project's team. The script needs the `vercel` CLI, `node`, `pnpm`, and `openssl`. Prefer to do it by hand? Follow the sequential steps below, or the full [Setup and Deployment](docs/setup-and-deploy.md) guide.

## Getting Started

For the full local setup, storage provisioning, Sign in with Vercel credentials, and production deploy flow, see [Setup and Deployment](docs/setup-and-deploy.md). For the runtime architecture, streaming model, persistence flow, and extension points, see [How the Chatbot Works](docs/how-the-chatbot-works.md).

Install dependencies with pnpm:

```bash
pnpm install
```

Link the Vercel project and pull environment variables:

```bash
vercel link
```

Provision storage with the [Vercel CLI integration commands](https://vercel.com/docs/cli/integration):

```bash
# Required: persisted chat, auth, eve session state, and message snapshots
vercel integration add neon

# Required: Redis-backed rate limiting
vercel integration add upstash
```

Follow the prompts to connect each resource to the linked project. Then pull the generated environment variables locally:

```bash
vercel env pull .env.local --yes
```

Required environment variables:

```bash
DATABASE_URL=
BETTER_AUTH_SECRET=
NEXT_PUBLIC_VERCEL_APP_CLIENT_ID=
VERCEL_APP_CLIENT_SECRET=
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
BLOB_READ_WRITE_TOKEN=
```

Optional environment variables:

```bash
# Override the app origin for custom production domains.
BETTER_AUTH_URL=

# Enable hosted Vercel Connect integrations.
SLACK_CONNECTOR=
LINEAR_CONNECTOR=
NOTION_CONNECTOR=
SENTRY_CONNECTOR=

# Embeddings route through the Vercel AI Gateway on the agent's existing credential.
# No separate API key needed. Provider is swappable via EMBEDDING_PROVIDER.
# EMBEDDING_PROVIDER=gateway
# EMBEDDING_MODEL=openai/text-embedding-3-small

# Override the default perception reader (local = app Postgres; http = external runtime).
# PROJECTION_READER=local

# Override the default Lab provider (local = app tables; http = external Lab).
# LAB_PROVIDER=local

# Optional: Dynamic Projections external runtime (not required; local reader works by default).
DREAM_MACHINE_RUNTIME_URL=
DREAM_MACHINE_RUNTIME_TOKEN=

# Optional: external Lab admission (not required; local Lab works by default).
DREAM_MACHINE_LAB_URL=
DREAM_MACHINE_LAB_TOKEN=
```

Create optional Vercel Connect integrations:

```bash
# Slack channel
vercel connect create slack --name independent-eve --triggers
vercel connect attach <slack-connector-uid> --triggers --trigger-path /eve/v1/slack --yes

# MCP connections
vercel connect create mcp.notion.com --name notion
vercel connect create https://mcp.linear.app/mcp --name linear
vercel connect create https://mcp.sentry.dev/mcp --name sentry
```

The deploy button does not require these integrations. For manual setup, put the returned connector UIDs in `SLACK_CONNECTOR`, `NOTION_CONNECTOR`, `LINEAR_CONNECTOR`, and `SENTRY_CONNECTOR`. Local development falls back to `slack/independent-eve`, `notion`, `linear`, and `sentry`, so connectors created with the names above work without editing `agent/`.

If the connector is not attached to the linked project, run:

```bash
vercel connect attach <connector-uid> --yes
vercel env pull .env.local
```

Create the database tables:

```bash
pnpm db:migrate
```

For production, run migrations with Vercel production env vars:

```bash
vercel env run -e production -- pnpm db:migrate
```

Start the development server:

```bash
pnpm dev
```

## What Is Included

- **Text chat** with an eve agent through same-origin `/eve/v1/*` routes
- **Better Auth** sign-in with Vercel
- **Neon-backed** chat history, tasks, memories, documents, notifications, and audit trail
- **Upstash Redis** rate limiting for authenticated chat sends
- **Dynamic Projections** — the agent perceives real state (tasks, audit trail, notifications) through a local SceneReader over the app's own Postgres, with honest loss accounting and a persistent projection ladder
- **Local Lab** — approved effects produce real consequences (tasks, notifications, audit rows) in the app's own tables, gated by reversibility class
- **Lab plugin** — surfaced in the same connections menu as Notion/Linear/Sentry with a per-turn toggle
- **Gateway embeddings** — document embeddings route through the Vercel AI Gateway on the agent's credential; no separate embedding key; provider-swappable (gateway / google / local)
- **Async document ingestion** — upload returns immediately; chunks are embedded in the background and flipped to `ready`
- **Drizzle** schema and migrations under `lib/db`
- **Saved eve session** cursors and event snapshots
- **Sidebar** history with delete and new-chat actions
- **Vercel Connect-backed** Notion, Linear, and Sentry MCP connections
- **Vercel Connect-backed** Slack channel route at `/eve/v1/slack`
- **Composer-level connections menu** with per-turn toggles
- **First-message chat titles** derived locally from the user's prompt
- **Streamdown** markdown rendering for assistant text and reasoning
- **shadcn/Tailwind** components for messages, tools, HITL prompts, and composer

## Architecture: Local Default, Open via Plugins

The piece follows a seam-and-registry pattern:

- **Perception in** (`SceneReaders.readRows`) defaults to the app's own Postgres; the dream-machine runtime and third-party readers are registered plugins.
- **Consequence out** (`LabProvider.admit`) defaults to the app's own tables; external Labs are registered plugins.
- **Inference / embeddings** (`generateEmbedding`) defaults to the Vercel AI Gateway on the agent's credential; google and local embedders are registered plugins.

Set `DREAM_MACHINE_RUNTIME_URL` / `DREAM_MACHINE_LAB_URL` (or register a third-party provider) to swap source or backend without touching the engine.

## Agent Code

Edit the agent in `agent/agent.ts`. Its behavior is defined in `agent/instructions.md`, and tools live in `agent/tools/`.

The browser talks to eve with `useEveAgent()` from `eve/react`; the app stores eve stream events and session state so `/chat/[id]` can resume the same durable conversation after refresh.
