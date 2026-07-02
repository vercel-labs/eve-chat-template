# Execution Plan: Finishing independent-eve

## Dependency Order
1. **Part 1** (Reader registry + LocalSceneReader) — keystone, must come first
2. **Part 2** (Lab plugin) + **Part 3** (Gateway embeddings) — can be parallel, depend only on registry pattern
3. **Part 4** (Close transplant) — migration + branding can happen anytime; dynamic toolset depends on 1-2
4. **Part 5** (Verification) — requires 1-4
5. **Part 6** (Pack) — last

## Stage 1: Part 1 — Make perception see real data
- `lib/projections/readers/types.ts` — extract SceneReaders interface
- `lib/projections/readers/http.ts` — move existing HTTP reader
- `lib/projections/readers/registry.ts` — provider registry with local default
- `lib/projections/readers/local.ts` — LocalSceneReader over app's Postgres
- `lib/projections/readers/index.ts` — re-export
- Wire `stream_id = principalId` in build_projection / navigate_projection execute
- Update `lib/projections/run.ts` to import from new registry path

## Stage 2: Part 2 — Lab as a first-class plugin
- `lib/lab/types.ts` — provider interface + EffectIntent/Result types
- `lib/lab/local.ts` — LocalLab admission into app tables
- `lib/lab/http.ts` — wrap existing dispatchEffect as provider
- `lib/lab/registry.ts` — provider registry
- `agent/tools/propose_effect.ts` — rewire to use registry
- `app/_components/chat-shell-context.tsx` — add lab to EnabledConnections
- `app/_components/agent-chat-shell.tsx` — init lab: true
- `components/chat/integrations-menu.tsx` — add Lab connection item
- `components/icons.tsx` — add LabIcon
- `app/_components/agent-chat.tsx` — add CONNECTION_LABELS

## Stage 3: Part 3 — Embeddings & ingestion
- Rewrite `lib/rag/embedding.ts` — route through AI Gateway, drop @ai-sdk/openai
- `lib/rag/providers.ts` — embedding provider seam (gateway/google/local)
- Update document upload/ingestion to use pending queue

## Stage 4: Part 4 — Close transplant items
- Apply migration 0009 (projection table) — already in drizzle, needs push
- Decide branding: rename package, update model name, update README
- Dynamic toolset for propose_effect when Lab enabled
- Fix stale comments

## Stage 5: Part 5 — Verify
- End-to-end projection loop with real data
- Airlock end-to-end
- Typecheck + build green

## Stage 6: Part 6 — Pack
- Update .env.example, validate-env.mjs, setup.ts
- Update docs
- CI + license
