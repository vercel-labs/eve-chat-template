# Eve Chat Template

A persisted Next.js chat template for [Eve](https://beta.eve.dev), built with shadcn/ui, Tailwind CSS, Streamdown, Better Auth, Drizzle, Neon, and Upstash Redis.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?project-name=eve-chat-template&repository-name=eve-chat-template&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Feve-chat-template%2Ftree%2Fmain&env=BETTER_AUTH_SECRET%2CNEXT_PUBLIC_VERCEL_APP_CLIENT_ID%2CVERCEL_APP_CLIENT_SECRET&envDescription=Neon+provisions+DATABASE_URL.+Upstash+Redis+provisions+rate-limit+storage.+Add+Better+Auth+secret+and+Sign+in+with+Vercel+credentials.+After+deploy%2C+run+production+migrations+from+the+setup+guide.&envLink=https%3A%2F%2Fgithub.com%2Fvercel-labs%2Feve-chat-template%2Fblob%2Fmain%2Fdocs%2Fsetup-and-deploy.md&products=%5B%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22neon%22%2C%22integrationSlug%22%3A%22neon%22%7D%2C%7B%22type%22%3A%22integration%22%2C%22protocol%22%3A%22storage%22%2C%22productSlug%22%3A%22upstash-kv%22%2C%22integrationSlug%22%3A%22upstash%22%7D%5D)

## Quick Start

Two ways to get going:

- **One-click:** use the **Deploy with Vercel** button above to clone and provision storage, then run migrations (see [Setup and Deployment](docs/setup-and-deploy.md#one-click-deploy)).
- **Local script:** clone the repo and run the setup script. It links the project, provisions Neon, registers the Sign in with Vercel OAuth app (email scope + callbacks), sets the environment variables through the Vercel API, pulls them locally, runs migrations, and can optionally set up the Notion connector. If OAuth app registration isn't available it falls back to a guided manual flow.

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
# Required: persisted chat, auth, Eve session state, and message snapshots
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
KV_REST_API_URL=
KV_REST_API_TOKEN=
```

Optional environment variables:

```bash
# Override the app origin for custom production domains.
BETTER_AUTH_URL=

# Enable hosted Notion support.
NOTION_CONNECTOR=
```

Create the Notion connector:

```bash
vercel connect create mcp.notion.com --name notion
```

The deploy button does not require Notion. For manual setup, put the returned connector UID in `NOTION_CONNECTOR`. The app falls back to `notion`, so local connectors created with `--name notion` work without editing `agent/connections/notion.ts`.

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

- Text chat with an Eve agent through same-origin `/eve/v1/*` routes
- Better Auth sign-in with Vercel
- Mandatory Neon-backed chat history
- Mandatory Upstash Redis rate limiting for authenticated chat sends
- Drizzle schema and migrations under `lib/db`
- Saved Eve session cursors and event snapshots
- Sidebar history with delete and new-chat actions
- Vercel Connect-backed Notion MCP connection
- Composer-level connections menu
- First-message chat titles derived locally from the user's prompt
- Streamdown markdown rendering for assistant text and reasoning
- shadcn/Tailwind components for messages, tools, HITL prompts, and composer

This template intentionally does not include Slack code, file uploads, Vercel Blob, guest mode, NextAuth/Auth.js, or AI Elements.

## Agent Code

Edit the agent in `agent/agent.ts`. Its behavior is defined in `agent/instructions.md`, and tools live in `agent/tools/`.

The browser talks to Eve with `useEveAgent()` from `eve/react`; the app stores Eve stream events and session state so `/chat/[id]` can resume the same durable conversation after refresh.
