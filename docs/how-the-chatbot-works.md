# How the Chatbot Works

This document explains the eve chat template end to end. It is written for
future maintainers who need to understand why the app is shaped this way, where
state lives, how messages stream, and how to safely change the chat experience.

The short version: this is not a generic stateless chat UI. The browser talks to
an eve agent through same-origin `/eve/v1/*` routes, persists eve stream events
and the eve session cursor in either browser storage or Postgres, and uses a
static Next.js shell so the sidebar and composer do not thrash during route
navigation.

## Main Pieces

The template has four major layers:

1. The eve agent layer in `agent/`
2. The Next.js shell and page layer in `app/`
3. The chat UI components in `components/chat/`
4. The persistence, auth, setup, and rate-limit layer in `lib/`

Important files:

| File | Purpose |
| --- | --- |
| `agent/agent.ts` | Defines the eve agent and model. |
| `agent/channels/eve.ts` | Configures the eve web channel and auth adapters. |
| `agent/channels/slack.ts` | Configures the Slack channel route and Vercel Connect credentials. |
| `next.config.ts` | Wraps the app with `withEve(nextConfig)`, which mounts the `/eve/v1/*` routes. |
| `app/(chat)/layout.tsx` | Renders the static chat shell immediately, then streams viewer/setup/sidebar data through Suspense. |
| `app/(chat)/page.tsx` | Root chat screen. Creates a new chat row and navigates into `/chat/[id]`. |
| `app/(chat)/chat/[id]/page.tsx` | Session route. Streams the active chat data into the client shell. |
| `app/_components/agent-chat-shell.tsx` | Client shell for sidebar state, history pagination, auth modal, and shared chat context. |
| `app/_components/home-chat-page.tsx` | Root-page composer and logo experience. |
| `app/_components/session-chat-page.tsx` | Session-page composer, active chat sync, and controller wiring. |
| `app/_components/agent-chat.tsx` | The eve client bridge: sending, streaming, persistence, resume, and display state. |
| `components/chat/composer.tsx` | The controlled chat input. |
| `components/chat/message.tsx` | Renders eve messages, markdown, reasoning, tools, and input requests. |
| `components/chat/sidebar.tsx` | Paginated chat history sidebar. |
| `app/actions/chat.ts` | Server actions for chat creation, persistence, pending state, and rate checks. |
| `app/api/chats/route.ts` | Paginated chat history endpoint. |
| `lib/chat/local-store.ts` | Versioned browser storage for starter-mode chats and eve session cursors. |
| `lib/chat/persistence-client.ts` | Routes client persistence calls to browser or database storage. |
| `lib/db/schema.ts` | Drizzle tables for Better Auth, chats, and chat events. |
| `lib/db/queries.ts` | Chat list, chat load, event save, snapshot save, and delete queries. |
| `lib/setup.ts` | Selects starter, local development, or production mode and validates readiness. |
| `lib/auth.ts` | Better Auth configuration with Sign in with Vercel. |
| `lib/password-auth.ts` | Shared-password verification and stateless signed session cookies. |
| `lib/eve-auth.ts` | Converts password or Better Auth sessions into eve channel principals. |
| `lib/rate-limit.ts` | Upstash Redis based fixed-window rate limiting. |

## Runtime Model

There are two related but separate concepts:

1. A **local app chat**, represented by a browser-storage record or a row in the `chat` table.
2. An **eve session**, represented by eve's `ClientSessionState` and remote session
   stream.

The app chat gives the user a stable URL such as `/chat/abc`, a sidebar title,
and persisted event history. The eve session is the durable conversation state
that eve uses to continue, wait for authorization, resume streams, and accept
follow-up input.

Production mode stores eve session state on the chat row:

```ts
chat.eveSession: ClientSessionState | null
```

Production mode stores eve stream events in ordered rows:

```ts
chat_event.eventIndex: number
chat_event.event: MessageStreamEvent
```

Starter mode keeps the same two values in a versioned localStorage record.
Those two pieces are intentionally separate. The `eveSession.streamIndex` tells
eve where to resume from in the remote session stream. The local
`chat_event.eventIndex` tells Postgres how to order the event log for rendering.
Do not treat those indices as interchangeable.

## Rendering Strategy

The app uses Next.js App Router with Cache Components enabled. The chat shell is
designed to render immediately, while dynamic data streams in behind hidden
Suspense boundaries.

### Shell First

`app/(chat)/layout.tsx` renders this immediately:

```tsx
<AgentChatShell
  initialChats={[]}
  initialNextCursor={null}
  setupStatus={getInitialSetupStatus()}
  viewer={null}
>
  {children}
  <Suspense fallback={null}>
    <ResolvedChatBootstrap />
  </Suspense>
</AgentChatShell>
```

The shell can paint the sidebar frame, top-right auth buttons, and route body
without waiting for the database or auth session. Then `ResolvedChatBootstrap`
fetches:

- setup readiness from `getSetupStatus()`
- the password, local-development, or Better Auth viewer from `getServerViewer(setupStatus)`
- the first page of database chat history in production mode

In starter mode, the client reads sidebar history from browser storage after
the viewer resolves.

It passes that data through `AgentChatBootstrapSync`, which dispatches a browser
event. `AgentChatShell` listens for that event and merges the real viewer,
setup status, and sidebar history into client state.

This pattern avoids a blocking route, which would delay the entire page.

### Session Route Data

`app/(chat)/chat/[id]/page.tsx` uses the same idea. It renders the session page
shell first:

```tsx
<SessionChatPage chatId={chatId}>
  <Suspense fallback={null}>
    <ExistingChat chatId={chatId} />
  </Suspense>
</SessionChatPage>
```

`ExistingChat` loads the active chat from Postgres in production mode and emits it through
`AgentChatRouteSync`. `SessionChatPage` listens for that sync event and then
passes the loaded `ActiveChat` into `AgentChatSession`.

This is why the top bar, sidebar, and composer can stay stable while the chat
body itself waits for data.

## Sidebar State And Pagination

The sidebar is owned by `AgentChatShell`.

State it owns:

- desktop sidebar open or closed
- mobile sidebar drawer open or closed
- current history page
- next cursor
- active chat id
- viewer
- setup status
- auth modal state

The desktop open/closed state is persisted in a cookie:

```ts
SIDEBAR_COOKIE_NAME = "eve-chat-sidebar"
```

`SidebarCookieScript` writes an early document hint before React hydrates. That
prevents the sidebar from opening for a frame and then collapsing.

Chat history is paginated. The first page is loaded by `ResolvedChatBootstrap`.
More pages are loaded from:

```txt
GET /api/chats?cursor=<cursor>
```

`listChatsPageByUser` orders by `updatedAt desc, id desc` and fetches
`CHAT_HISTORY_PAGE_SIZE + 1`, where the page size is currently 20. The extra
row determines whether there is a next cursor.

The cursor is encoded as:

```txt
<updatedAt ISO string>::<chat id>
```

The sidebar uses an intersection observer sentinel at the bottom of the list.
When it becomes visible, `AgentChatShell.loadMoreChats()` fetches the next page
and appends only chats that are not already present.

Creating, sending to, or deleting a chat updates the sidebar optimistically
through:

- `touchChat(chat)`
- `removeChat(chatId)`
- `updateChatTitle(chatId, title)`

## Root Page Flow

The root route is `app/(chat)/page.tsx`, rendered by `HomeChatPage`.

The root page is the "start a new chat" experience. It has:

- the eve logo
- a centered composer
- footer links
- the shared sidebar and top auth controls from `AgentChatShell`

When the user submits the first message:

1. The input is trimmed.
2. If setup is incomplete, an error toast explains what is missing.
3. If the user is not signed in, `requestSignIn(message)` opens the auth modal
   and saves the draft in `sessionStorage`.
4. If the user is signed in, `createChatAction({ pendingUserMessage: message })`
   creates a chat row.
5. The chat title is derived from the first user message with
   `createFallbackTitle`.
6. The new chat is inserted into the sidebar with `touchChat(created)`.
7. The app navigates to `/chat/<id>`.

The root page does not call eve directly. It creates the app chat first and
lets the session route consume the pending message once the eve client is ready.

That matters because a chat URL should exist before the first response starts
streaming.

## Session Page Flow

The session route is rendered by `SessionChatPage`.

`SessionChatPage` owns:

- the loaded `ActiveChat`
- the controlled composer draft
- a ref to the `AgentChatController`
- loading/error UI for the route
- the pending user message loaded from the database

The `AgentChatController` is provided by `AgentChatSession`:

```ts
type AgentChatController = {
  reset: () => void;
  sendMessage: (text: string, draftHandlers: DraftHandlers) => Promise<void>;
  stop: () => void;
};
```

The session composer calls `controller.sendMessage(text, handlers)`.

If the route loaded a `pendingUserMessage`, `SessionChatPage` auto-consumes it
once:

- the chat has loaded
- the controller exists
- the controller is not busy
- the controller is not disabled by setup or pending authorization

This is how the first message from the root page actually gets sent to eve after
navigation.

## eve Client Bridge

Most of the chat logic lives in `app/_components/agent-chat.tsx`.

The core hook is:

```tsx
const agent = useEveAgent({
  initialEvents: activeChat?.events ?? [],
  initialSession: activeChat?.session,
  onEvent: persistStreamEvent,
  onFinish: (snapshot) => {
    void persistSnapshot(snapshot);
  },
  onSessionChange: (session) => {
    void persistSessionState(session);
  },
});
```

`useEveAgent` handles reducing eve stream events into renderable chat messages.
The template wraps it with persistence and resume logic.

### Built-In Client Session

`useEveAgent` owns the browser transport and exposes `send`, `respond`,
`session`, and reduced event/message state. `onSessionChange` saves the latest
`ClientSessionState` as soon as eve creates or advances the session.

The app never talks directly to a third-party model endpoint. It talks to eve's
same-origin session API, which is mounted by `withEve(nextConfig)`.

### Streaming And Resume

The hook opens the same-origin eve session stream:

```txt
GET /eve/v1/session/:sessionId/stream?startIndex=<n>
```

It reduces newline-delimited events into UI state and invokes the persistence
callbacks. The template does not duplicate eve's transport, parsing, retry, or
session-cursor implementation. During an ordinary turn, the UI renders
`agent.data.messages` directly; it does not maintain a second live event
projection or replay eve's cumulative text through another timer.

A turn is considered settled when `lib/chat/events.ts` sees one of:

```ts
session.completed
session.failed
session.waiting
```

Refresh recovery uses `Client.sessions.attach()` at the persisted stream cursor
and feeds the resulting events into the same snapshot persistence path.

## Sending A Message

Follow-up messages are sent by `AgentChatSession.sendMessage`.

The intended order is:

1. Ignore empty input.
2. Ignore if the session is already busy.
3. Render an optimistic user bubble immediately when possible.
4. Run one client preflight that combines rate limiting, chat creation/update,
   and the pending-message write.
5. Call `agent.send(message)`.
6. Let `useEveAgent`, `onEvent`, and `onFinish` handle streaming and
   persistence.

`prepareSend` does the things that must happen before talking to eve:

- verify setup is ready
- request sign-in if there is no viewer
- check Redis rate limits
- create a chat row if one does not exist yet
- navigate to the new chat URL when necessary

The optimistic user bubble is separate from persisted eve events. It is created
with `createPendingUserMessage`. Once the real eve message appears in the
reduced message list, `hasLatestUserMessage` clears the local pending bubble.

This keeps the UI feeling immediate while still letting eve produce the
canonical event log.

## Persistence Model

The app persists at two moments:

1. In short batches while stream events arrive
2. When the final snapshot is available

### Batched Event Persistence

`persistStreamEvent(event)` queues events and flushes them through:

```ts
appendChatEventsAction({
  chatId,
  events: [{ event, eventIndex }],
});
```

`eventIndex` is a local monotonic counter for the current chat. The database has
a unique index on `(chatId, eventIndex)`, and writes use conflict updates so
retrying a write can replace the same slot.

The queue flushes about every 500 ms. This keeps refresh/resume durability
without paying one authentication and persistence round trip per stream event.

### Snapshot Persistence

When `useEveAgent` finishes a turn, it calls `onFinish(snapshot)`.

The snapshot includes:

- the full reduced event list known by eve React
- the current eve `ClientSessionState`

The template calls `saveChatSnapshotAction({ chatId, events, session })`.

`saveChatSnapshot` upserts each event by index, deletes any events past the new
snapshot length, saves the eve session state, clears `pendingUserMessage`, and
updates the chat timestamp.

### Why Snapshot Merging Exists

There are cases where the snapshot returned by the hook starts after some
initial events that the app already loaded from Postgres.

To avoid losing or duplicating history, `persistSnapshot` merges the known
database prefix with `snapshot.events` using eve's stable event identity:

- `event.meta.id`

This is the same deduplication contract eve documents for reconnects and
rewinds. Events from sessions written before stream event IDs existed fall back
to structural JSON comparison.

## Pending Message Recovery

`pendingUserMessage` exists for interrupted first sends and interrupted
follow-up sends.

The flow:

1. Before sending to eve, the client preflight stores the pending message while
   creating or updating the chat.
2. The chat row stores:
   - `pendingUserMessage`
   - `pendingUserMessageCreatedAt`
3. If the page refreshes before the turn completes, `getChatForUser` returns the
   pending message.
4. `SessionChatPage` consumes it once the controller is ready.
5. After a settled event is persisted, `getChatForUser` hides stale pending
   messages.
6. `saveChatSnapshot` clears pending state.

This gives the app a way to recover from "message was accepted by the UI but the
browser left before eve completed."

## Refresh And Resume

If a user refreshes during an in-progress eve turn, the app can resume from the
saved eve session.

`AgentChatSession` checks:

- there is a viewer
- there is a `pendingUserMessage`
- the loaded chat has an `activeChat.session.sessionId`
- resume has not already started
- `useEveAgent` is ready

Then it attaches the eve client to the saved session and streams from its
cursor:

```ts
client.sessions
  .attach(activeChat.session.sessionId, {
    streamIndex: activeChat.events.length,
  })
  .stream({ startIndex: activeChat.events.length })
```

Each resumed event is:

- appended to local resume overlay state
- later included in the final snapshot

When a settled event arrives, the app saves the full snapshot and clears pending
state.

The resume overlay exists because the main `useEveAgent` instance was initialized
from the loaded events. New resumed events are layered on top until the parent
chat state contains their `meta.id` values. Clearing the overlay after that
handoff cannot make text disappear because the persisted and hook event logs are
merged by event identity.

## Cancelling A Response

The composer stop button requests durable cancellation with
`ClientSession.cancel({ turnId })`. The browser keeps consuming the stream until
eve emits `turn.cancelled` and `session.waiting`, so the final cursor and event
snapshot remain resumable. `useEveAgent.stop()` is intentionally reserved for
unmount/reset because it only detaches the browser stream and does not stop the
server-side turn.

## Auth

Starter mode uses a shared deployment password. The login route verifies
`EVE_CHAT_PASSWORD` and issues a signed, HTTP-only, same-site cookie without a
database. `lib/session.ts` and `lib/eve-auth.ts` verify the same cookie for the
Next.js UI and eve route boundary.

Production mode uses Better Auth with Sign in with Vercel.

`lib/auth-url.ts` resolves the base app URL in this order:

1. `BETTER_AUTH_URL`
2. `VERCEL_PROJECT_PRODUCTION_URL`
3. `VERCEL_URL`
4. `http://localhost:3000`

`lib/auth.ts` configures Better Auth with:

- Drizzle adapter
- encrypted OAuth tokens
- Vercel social provider
- required scopes: `openid`, `email`, `profile`
- `/auth/error` as the error page

`lib/session.ts` returns a safe `Viewer` object for server components. It returns
the shared starter viewer, local development viewer, or Vercel user depending
on the selected mode.

`lib/eve-auth.ts` adapts the selected app session into an eve channel principal.
Production mode uses:

```ts
{
  principalType: "user",
  principalId: session.user.id,
  subject: session.user.email,
  attributes: {
    email: session.user.email,
    name: session.user.name,
  },
}
```

`agent/channels/eve.ts` allows:

- `betterAuthEveAuth`
- `passwordEveAuth`
- `vercelOidc()`
- `localDev()`

That lets the same channel work locally, in authenticated browser sessions, and
with Vercel OIDC contexts.

## Setup Readiness

`lib/setup.ts` produces a `SetupStatus` object:

```ts
type SetupStatus = {
  appReady: boolean;
  authMode: "local-dev" | "password" | "unconfigured" | "vercel";
  authReady: boolean;
  databaseConfigured: boolean;
  databaseReady: boolean;
  databaseSchemaReady: boolean;
  missing: readonly string[];
  rateLimitReady: boolean;
  storageMode: "browser" | "database";
};
```

The starter is ready when `EVE_CHAT_PASSWORD` is non-empty. A strong value with
16+ characters is recommended. Local development is ready on loopback without
configuration. Production mode is
selected when all of these are configured:

- `DATABASE_URL` exists
- database migrations have created the expected tables
- Better Auth env vars are present
- Upstash Redis env vars are present

Production mode then checks whether these Postgres tables exist:

- `account`
- `chat`
- `chat_event`
- `session`
- `user`
- `verification`

The UI uses setup status in three places:

1. Root composer disabled state
2. Session composer disabled state
3. Sidebar auth/sign-in controls

Disabled composers should always provide a reason through tooltip text.

## Rate Limiting

Production-mode rate limiting uses Upstash Redis in `lib/rate-limit.ts`.

The app supports either current Upstash env names:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

or legacy Vercel KV env names:

- `KV_REST_API_URL`
- `KV_REST_API_TOKEN`

`enforceRateLimit` uses a fixed window key:

```txt
rate:<prefix>:<viewer id>:<window id>
```

The current send limits are:

- `chat:create`: 25 per hour
- `chat:send`: 25 per hour
- Message length: 8,000 characters

The create and send limits are separate so creating a chat and then sending a
message can be guarded independently. Message length is enforced in the
composer and again in server actions before creating chats or saving pending
messages.

## Message Rendering

`useEveAgent` reduces stream events into message data. The template renders that
data through `components/chat/message.tsx`.

Message rendering supports:

- user bubbles
- assistant markdown through Streamdown
- reasoning parts
- dynamic tool parts
- tool input/response UI
- optimistic pending user messages
- a separate "Thinking..." presence row

User messages are rendered as rounded, compact bubbles aligned to the right.
Assistant messages are full-width text on the left.

Tool calls are grouped so a sequence of dynamic tool parts appears as one
compact row. Tool rows can be expanded only when they have useful details or
input controls.

Reasoning parts render as a collapsible block. While streaming, the label says
"Thinking..." and uses shimmer text.

The standalone `ThinkingMessage` appears only while the session is busy and the
latest assistant message has no renderable text, reasoning, tool, attachment, or
authorization progress. It fades out as soon as real assistant output arrives;
database finalization does not keep a stale thinking row under a completed
answer.

## Composer Behavior

`components/chat/composer.tsx` is controlled by the page:

- `value`
- `onChange`
- `onSubmit`
- `disabled`
- `disabledReason`
- `isBusy`
- `isPreparing`

The composer:

- auto-focuses when enabled
- submits on Enter
- inserts a newline on Shift+Enter
- disables while a request is in flight
- shows a stop button when eve is busy
- shows a spinner when the root page is creating a chat
- wraps disabled states in a tooltip

Root and session pages render the same composer component, but they place it
differently:

- root page: centered with the eve logo
- session page: pinned near the bottom of the chat route

This separation prevents root route layout from briefly looking like a session
route and vice versa.

## Error Handling

User-visible request failures render as `ErrorToast`, not inline layout blocks.
That keeps errors from pushing the composer or chat body around.

Common setup errors:

- missing or short `EVE_CHAT_PASSWORD` in starter mode
- incomplete Neon, Better Auth/Vercel OAuth, or Upstash configuration
- production migrations not run
- Vercel OAuth app missing the `email` scope

Common stream errors:

- stream disconnected before a settled event
- eve session missing when trying to resume
- rate limit exceeded

The app generally prefers:

- toast for recoverable request failures
- disabled composer with tooltip for setup blockers

## Event Log Invariants

These invariants are important:

1. `chat_event.eventIndex` must be unique per chat.
2. A completed snapshot should overwrite stale event rows by index.
3. Rows beyond the final snapshot length should be deleted.
4. `pendingUserMessage` should be cleared after a settled turn.
5. A route change should reset per-chat refs such as event index and local
   pending messages.
6. Sidebar history should update optimistically, but the event log remains the
   source of truth for chat content.

When debugging "messages replaced old messages" or "a response updated after it
looked complete", inspect these pieces first:

- whether two events were written to the same local `eventIndex`
- whether `preserveKnownInitialEvents` duplicated or dropped a prefix
- whether `pendingUserMessage` was left on the chat row after a settled event
- whether the eve stream ended with `session.waiting` before the UI expected it
- whether a local optimistic message was cleared before the real user event
  appeared

## Adding A New Tool

To add a local eve tool:

1. Create a file in `agent/tools/`.
2. Export a `defineTool(...)`.
3. Import/register it according to eve's agent conventions.
4. Update `agent/instructions.md` so the agent knows when to use it.
5. If the UI should render a special tool state, update
   `components/chat/message.tsx`.

Keep tool output structured. The message renderer can make much better UI
decisions when tool parts contain predictable JSON instead of prose-only output.

## Adding A New Channel

This template exposes a web chat channel through `agent/channels/eve.ts`, a
Slack channel through `agent/channels/slack.ts`, and the `withEve` Next.js
integration.

If you add another channel, keep this separation:

- channel-specific webhook or transport code belongs in `agent/channels/`
- web chat UI state belongs in `app/_components/` and `components/chat/`
- cross-channel agent behavior belongs in `agent/instructions.md` and tools

The web chat persistence code is intentionally tied to the browser experience.
Do not reuse it as a generic state adapter for every channel without checking
the other channel's message and session semantics.

## Development Checklist

When making changes to the chat flow, verify:

1. Root page renders without layout shift.
2. Unauthenticated users can type, then are prompted to sign in.
3. First message creates a chat and appears immediately after navigation.
4. Follow-up messages appear optimistically.
5. Assistant text streams without replacing older messages.
6. Refreshing mid-response resumes or ends with a clear error.
7. Sidebar history remains visible and active row state is correct.
8. Sidebar pagination still loads older chats.
9. Setup blockers show tooltips or actionable auth/setup pages.
10. `pnpm typecheck` and `pnpm build` pass.

## Mental Model

Think of the app as a small durable chat runtime:

```mermaid
flowchart TD
  User["User submits text"] --> Composer["ChatComposer"]
  Composer --> Page["HomeChatPage or SessionChatPage"]
  Page --> Controller["AgentChatSession controller"]
  Controller --> Pending["Mark pendingUserMessage"]
  Pending --> EvePost["POST /eve/v1/session"]
  EvePost --> Stream["GET /eve/v1/session/:id/stream"]
  Stream --> EventRows["append chat_event rows"]
  Stream --> UI["useEveAgent renders messages"]
  UI --> Snapshot["onFinish saves full snapshot"]
  Snapshot --> ChatRow["chat.eveSession and pending cleared"]
  ChatRow --> Sidebar["touchChat updates sidebar"]
```

The browser is allowed to be interrupted. Postgres keeps enough state to rebuild
the UI and continue from eve's stream cursor. The static shell keeps navigation
smooth. The final snapshot keeps the event log canonical.

That is the core design.
