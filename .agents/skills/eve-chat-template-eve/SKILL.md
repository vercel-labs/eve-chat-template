---
name: eve-chat-template-eve
description: Work safely on eve-specific internals in the eve chat template. Use when changing the eve agent, withEve routes, eveChannel auth, useEveAgent, ClientSession/SessionState, persisted event logs, stream/resume behavior, local eve tools, or upstream eve API assumptions.
---

# Eve Template Runtime

## Overview

Use this skill to preserve the Eve protocol and durable-session invariants while changing the chat template.

## First Pass

- Read `AGENTS.md` first. It requires reading the relevant guide under `node_modules/eve/dist/docs/public/` before writing code.
- Read `docs/how-the-chatbot-works.md` for architecture changes and `docs/setup-and-deploy.md` for setup, auth, storage, or deployment changes.
- Search with `rg "useEveAgent|ClientSession|SessionState|message.appended|eveSession|chat_event|streamIndex|continuationToken|defineTool"`.
- Keep Eve runtime code separate from product shell code: `agent/` defines agent behavior; `app/_components/agent-chat.tsx` bridges Eve to the web UI; `lib/db/*` persists app state.

## Core Model

- Treat an app chat row and an Eve session as different things. The app row owns URL, title, user ownership, `pendingUserMessage`, stored `eveSession`, and event rows. Eve owns the remote durable session and stream cursor.
- Do not confuse `chat_event.eventIndex` with `SessionState.streamIndex`. The first orders local Postgres rows; the second resumes `/eve/v1/session/:sessionId/stream`.
- Preserve same-origin Eve routes mounted by `withEve(nextConfig)`: `POST /eve/v1/session`, `POST /eve/v1/session/:sessionId`, and `GET /eve/v1/session/:sessionId/stream?startIndex=n`.
- Keep `betterAuthEveAuth`, `localDev()`, and `vercelOidc()` in the Eve channel unless deliberately changing local, browser, or Vercel auth behavior.

## Persistence And Resume

- Persist `SessionState` immediately after Eve returns `sessionId` and `continuationToken`; do not wait for the stream to finish.
- Persist each stream event as it arrives, then use the final snapshot as the canonical cleanup pass.
- Upsert events by local `eventIndex`; on final snapshot, delete rows beyond the final event length.
- Keep `pendingUserMessage` for interruption recovery. Mark it before sending, consume it once in the session page, hide it after a settled event, and clear it after snapshot.
- When preserving initial events, merge by prefix and compare JSON structurally. Do not rely on `JSON.stringify` key order.
- Reset per-chat refs on route changes: event index, known initial events, stream events, resumed events, pending bubbles, resume-started flags, and finalize timers.

## Streaming

- `useEveAgent` reduces Eve events into renderable messages; the template wraps it with a custom `ClientSession` to persist and resume sessions.
- Treat `message.appended.data.messageDelta` as the new text. Treat `messageSoFar`, reduced message text, and rendered parts as cumulative.
- Read the stream as NDJSON. Buffering until newline is normal parsing, not app-level response buffering.
- Consider a turn settled on `session.completed`, `session.failed`, or `session.waiting`.
- On disconnect, reconnect from the next unread remote stream index. On refresh mid-turn, resume from saved `activeChat.session` and layer resumed events until the final snapshot catches up.

## Tools

- Define local tools in `agent/tools/<snake_case>.ts` with `defineTool(...)`. Tool filenames become runtime tool names, so keep them ASCII snake_case.

## Upstream Signals

- Prefer upstreaming generic eve lifecycle needs: `onSessionStarted(session)`, hook-level resume APIs, durable event persistence adapters, and stream debug helpers.
- Keep template-specific concerns in the template: Better Auth UX, Neon/Drizzle schema, Upstash limits, sidebar pagination, and setup docs.
- Do not split server events just to make coarse provider deltas look token-level. Preserve wire semantics and smooth only at the UI layer when needed.

## Verification

- Run `pnpm typecheck` for protocol/type changes and `pnpm build` before opening a PR that touches runtime, routes, or docs examples.
- Manually verify first message, follow-up send, and refresh during a response when those flows are touched.
