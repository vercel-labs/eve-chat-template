# Transplante do motor de Dynamic Projections — progresso

Fonte da verdade do plano: `guia-mistral-eve-transplante.md` (Downloads).
Motor sendo extraído de: `dream-machine-codex-dream-machine-membrane-contracts/`.
Destino: este repo (`eve-chat-template`, Next.js — **não** monorepo).

## Decisões de arquitetura já tomadas
- O motor vive em `lib/projections/` (não `packages/`, porque o destino é app único; alias `@/*` já cobre).
- Hash canônico (JCS / RFC 8785) via dependência `canonicalize`, não implementação à mão.
- O guia é o spec; não duplicamos em doc separado. Este arquivo é só o rastreador.

## Mapa de tradução fonte → destino
- Fonte é Nuxt/Vue; destino é Next.js/React.
- Lógica TS pura (engine, governor, compose, filter, hash, types) porta direto (trocar imports `.js`).
- UI (`Scene.vue` → `ProjectionCard`) é **reescrita em React**, não cópia.

## Checklist (Parte 6 do guia)
- [x] 1. `lib/projections/types.ts` — contrato DynamicProjection (Parte 4.4)
- [x] 2. `lib/projections/hash.ts` — JCS / RFC 8785
- [x] 3. `lib/projections/engine.ts` — port de `scene.ts`; hash plugado (projectionHash nos 3 pontos). Scene types reais em `scene-types.ts`. Erros em `errors.ts`.
- [x] 4. `lib/projections/governor.ts` — saliência + rankAndBound + legalMoves + proposals
- [x] 5. `lib/projections/compose.ts` + `filter.ts`
- [x] 6. Registry NOVO em Drizzle/Neon (Escopo A, mínimo). **Correção ao guia:** o "adaptador Envelope" da Parte 3.3 NÃO existe neste checkout — `envelope-effect-store.ts`/`envelope-verify.ts` são sobre effect crossings + verify de stream e chamam um repo SPINE externo (`Dream-Machine-Envelope-Ledger/`) ausente; zero ocorrências de projection store na fonte. Então: tabela `projection` (PK = projection_hash, content-addressed) em `schema.ts` + migration `0009_*.sql`; `lib/db/projections.ts` (`storeProjection`/`getProjection`/`ProjectionStore`); `run.ts` persiste toda projeção (best-effort) e `scene.back` reabre o parent EXATO por hash. **Não feito (fase 2):** changes_since/diff, verifier, ttl/stale sofisticado. Falta aplicar a migration ao DB (`pnpm db:migrate`) quando houver `DATABASE_URL`.
- [x] 7. `lib/projections/readers.ts` — cliente HTTP `createSceneReaders()` para `POST <url>/projection` (modo rows), bearer opcional, timeout/abort. Sem sqlite/python/legacy. Sem URL → rows vazias com meta (degradação graciosa). Env: `DREAM_MACHINE_RUNTIME_URL/_TOKEN/_TIMEOUT_MS` (em `.env.example`).
- [x] 8. `agent/tools/build_projection.ts` — abre a cena (scene.open). Auto-descoberta pelo eve (nome do arquivo = nome da tool).
- [x] 9. `agent/tools/navigate_projection.ts` — movimentos de ladder a partir de um parent_projection_hash. (Runner compartilhado em `lib/projections/run.ts`.) `scene.back` agora REABRE o parent exato por hash (via item 6); demais movimentos recalculam.
- [x] 10. UI ProjectionCard (React) — **régua backstage**: Dynamic Projections é maquinário de bastidor (Eve puxa views autonomamente p/ entender tabela gigante); o humano quer a RESPOSTA, não cada projeção. Por isso:
  - **Default colapsado**: projeções fluem pela `ToolGroup` quieta (não card protagonista).
  - **Narração viva**: label projection-aware com spinner enquanto roda ("Pedindo projeção: <goal>…" / "Navegando: drill…") → assenta em "Projeção: <goal>". (`describeProjectionAction` em message.tsx.)
  - **Linha de cobertura sempre visível** acima da resposta: "Baseado em X de Y itens · Z não examinados" (`getProjectionCoverage`/`ProjectionCoverageLine`). É a única parte do mecanismo que interessa ao humano (confiança na resposta).
  - **Card = detalhe sob demanda** (no expand, em `ToolDetails`): goal, stale/reaberta, loss, ProcessViews, proposals "requer airlock", legal_next_moves como botões; hash/op rebaixados ao rodapé.
  - Navegação via context `ProjectionNavProvider` (agent-chat.tsx) → sendMessage → instrução → agente chama navigate_projection. Card só renderiza + dispara, sem lógica/custody.
  - Validado: tsgo + `pnpm build` verdes. NÃO visto com dados vivos (precisa cred de modelo).
- [x] 11. Doutrina de percepção — agora dividida (usando primitivo nativo do eve): instructions.md mantém um PISO always-on curto (stance + honestidade de loss, que é segurança); o PLAYBOOK completo virou skill on-demand `agent/skills/dynamic_projections.md` (loop, 3 projeções, caso tabela-gigante, quando parar, proposals→airlock, backstage). Carregado só quando relevante (description triggera). Bônus anterior: removido marcador de merge solto na instructions.md. Verificado: eve build registra o skill; tsgo verde.
- [x] 12. 3 projeções: `lib/projections/presets.ts` (attention.field · project.current_state · risk.map, como goals canônicos) + referenciadas no system prompt.
- [x] 13. Lab adapter: conclusão → efeito, via AIRLOCK NATIVO do eve. Tool `agent/tools/propose_effect.ts` com `needsApproval: always()` (de `eve/tools/approval`) — o turno pausa e o humano aprova antes de despachar; mapeia uma proposal do bundle para uma intenção de efeito (intent/reason/effect_class/args/source_projection_hash). Seam `lib/lab/client.ts` `dispatchEffect()` → POST <DREAM_MACHINE_LAB_URL>/effect com bearer; degrada honesto sem URL (aprovado mas não despachado), propaga erro real. Receipt via `logToolCall` (audit). Skill nomeia a tool. Env: `DREAM_MACHINE_LAB_URL/_TOKEN/_TIMEOUT_MS`. Verificado: tsgo + eve build (tool + 'approval' no manifest) + smoke do dispatchEffect (3 caminhos). NÃO feito: admissão real (precisa runtime de Lab externo, como Envelope); fluxo de aprovação na UI não visto vivo (precisa cred de modelo).
- [ ] 14. Decidir nome/model (Mistral de fato vs branding; hoje `anthropic/claude-haiku-4.5`)
- [~] 15. Fechar buracos: ladder persistente ✅ e back por hash ✅ (via item 6). Falta: owner único do motor (KERNEL/SPINE/FACE), dynamic toolset por estado.

## Validação de runtime (2026-06-29)
- [x] Migration `0009` aplicada no Neon real (`pnpm db:migrate`).
- [x] Circuito vivo contra o Neon real: `runProjection` (store Drizzle, não fake) → BUILD grava row → `getProjection` lê → BACK reabre por hash. Rows de teste limpas depois.
- [x] `pnpm eve:build` OK: `build_projection` e `navigate_projection` registradas no grafo do agente (`.eve/.../*manifest*.json`); `canonicalize` bundlado no runtime.
- [ ] **Bloqueado**: Eve (LLM) chamar `build_projection` num chat real. Falta credencial de modelo — nenhuma de `ANTHROPIC_API_KEY` / `AI_GATEWAY_API_KEY` / `VERCEL_OIDC_TOKEN` está no `.env.local`. Sem `DREAM_MACHINE_RUNTIME_URL`, as cenas vêm vazias (degradação ok). Requisitos do ambiente para fechar: node 24 (mise já tem; `pnpm` reusa node 20 do sistema — prefixar PATH com `~/.local/share/mise/installs/node/24.18.0/bin`).

## Pendência separada do código
- [ ] 0. Rotacionar segredos do `.env.local` (o original vazou; usar só clean pack).

## Onde estamos
Itens 1-13 feitos e verificados. Arco completo: percepção (motor + reader + registry + card + skill) E consequência (propose_effect via airlock nativo). Verificação acumulada: tsgo verde; smoke tests de motor/reader/runner/registry/lab; circuito de projeção vivo contra Neon real (build/store/back-por-hash); eve build registra tools+skill+approval; `pnpm build` compila a UI.

Falta:
- Item 14 (decidir nome/model — hoje anthropic/claude-haiku-4.5). Item 0 (rotacionar segredos).
- Item 15 resto (owner único do motor; dynamic toolset por estado).
- Gate antes de release (precisa cred de modelo): ver a Eve chamar build_projection, o card renderizar, e o airlock do propose_effect pausar/aprovar — tudo com dados vivos. E os seams reais: DREAM_MACHINE_RUNTIME_URL (projeção) e DREAM_MACHINE_LAB_URL (efeito).
- Fase 2 do registry: changes_since/diff, verifier.

Nota de verificação: o destino não tem framework de teste; verifiquei via tsgo + smoke test compilado com tsc/loader hook (não commitado). Vale decidir depois se adicionamos vitest para fixar os testes do motor.
