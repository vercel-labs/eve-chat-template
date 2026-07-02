"use client";

// ProjectionCard — reimplementação React do Scene.vue da fonte (item 10).
//
// TRAVA DE DESIGN: este componente SÓ renderiza um SceneResponse e DISPARA
// navigate_projection (via instrução ao agente). Ele não tem lógica de motor,
// não toca custody, não executa consequência. proposals aparecem marcadas como
// "requires airlock" — nunca como ação direta. O motor segue em lib/projections,
// a custody no registry, e a consequência fora, via Lab/airlock.

import { createContext, useContext, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  SceneResponse,
  ProcessView,
  LegalNextMove,
  Proposal,
  RiskTier,
} from "@/lib/projections/scene-types";

// ---- navegação por context (sem prop-drilling pelo message.tsx) ----

type NavigateFn = (instruction: string) => void;
const ProjectionNavContext = createContext<NavigateFn | null>(null);

export function ProjectionNavProvider({
  navigate,
  children,
}: {
  readonly navigate: NavigateFn;
  readonly children: ReactNode;
}) {
  return <ProjectionNavContext.Provider value={navigate}>{children}</ProjectionNavContext.Provider>;
}

function useProjectionNav() {
  return useContext(ProjectionNavContext);
}

// ---- tipos do resultado da tool (estrutural, sem importar run.ts server-side) ----

type ProjectionToolOutput = {
  ok: true;
  scene: SceneResponse;
  reopened?: boolean;
  cannot_do: string[];
};

// ---- helpers de apresentação ----

const RISK_TONE: Record<RiskTier, string> = {
  L0: "bg-muted text-muted-foreground",
  L1: "bg-muted text-muted-foreground",
  L2: "bg-muted text-muted-foreground",
  L3: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  L4: "bg-destructive/15 text-destructive",
  L5: "bg-destructive/15 text-destructive",
};

function Pill({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[10px] leading-none",
        className,
      )}
    >
      {children}
    </span>
  );
}

function shortHash(hash: string) {
  const body = hash.replace(/^sha256:/, "");
  return `${hash.startsWith("sha256:") ? "sha256:" : ""}${body.slice(0, 10)}…`;
}

function fmtAge(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

// ---- o card ----

export function ProjectionCard({ output }: { readonly output: unknown }) {
  const navigate = useProjectionNav();
  const result = output as ProjectionToolOutput | undefined;
  if (!result || result.ok !== true || !result.scene) {
    return null;
  }
  const scene = result.scene;
  const loss = scene.loss_accounting;
  const partial = scene.warnings.some((w) => w.kind === "partial_source");
  const items = scene.view.items;

  const runMove = (move: LegalNextMove) => {
    if (!navigate) return;
    const args = move.args ?? {};
    const fields = [`op=${move.move}`, `parent_projection_hash=${scene.projection_hash}`];
    if (typeof args.group_by === "string") fields.push(`group_by=${args.group_by}`);
    if (typeof args.filter === "string") fields.push(`filter=${args.filter}`);
    if (typeof args.focus === "string") fields.push(`focus=${args.focus}`);
    navigate(`Use a tool navigate_projection com ${fields.join(", ")}.`);
  };

  return (
    <div className="my-2 w-full overflow-hidden rounded-lg border border-border/70 bg-muted/10 text-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border/50 bg-muted/30 px-3 py-2">
        <span className="font-medium text-foreground">
          {scene.goal?.trim() || "Projeção"}
        </span>
        {scene.freshness.stale ? (
          <Pill className="bg-amber-500/15 text-amber-600 dark:text-amber-400">stale</Pill>
        ) : null}
        {result.reopened ? (
          <Pill className="bg-background text-muted-foreground">reaberta por hash</Pill>
        ) : null}
      </div>

      <div className="space-y-3 px-3 py-2.5">
        {/* Banner de fonte parcial / vazio */}
        {partial ? (
          <p className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
            Fonte parcial: sem runtime de projeção (DREAM_MACHINE_RUNTIME_URL ausente) ou ledger vazio.
            A cena pode não refletir toda a realidade.
          </p>
        ) : null}

        {/* Loss accounting — honestidade da perda */}
        <div className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">
            Mostrando {loss.visible_count} de {loss.total_candidates}
          </span>
          {loss.omitted_count > 0 ? <span> · {loss.omitted_count} omitidos</span> : null}
          {loss.omitted_reasons.length > 0 ? (
            <span> ({loss.omitted_reasons.join("; ")})</span>
          ) : null}
          {loss.confidence_limits.length > 0 ? (
            <p className="mt-0.5 italic">{loss.confidence_limits.join(" ")}</p>
          ) : null}
        </div>

        {/* ProcessViews */}
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum item visível nesta projeção.</p>
        ) : (
          <ul className="space-y-1.5">
            {items.map((view) => (
              <ProcessViewRow key={view.id} view={view} />
            ))}
          </ul>
        )}

        {/* Proposals — efeito possível, requer airlock */}
        {scene.proposals.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Propostas · requer airlock (não executável aqui)
            </p>
            {scene.proposals.map((p) => (
              <ProposalRow key={p.intent + p.label} proposal={p} />
            ))}
          </div>
        ) : null}

        {/* Legal next moves — navegação read-only */}
        {scene.legal_next_moves.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 border-t border-border/40 pt-2.5">
            {scene.legal_next_moves.map((move) => (
              <Button
                key={move.move + move.label}
                disabled={!navigate}
                onClick={() => runMove(move)}
                size="xs"
                title={move.reason}
                type="button"
                variant="outline"
              >
                {move.label}
              </Button>
            ))}
          </div>
        ) : null}

        {/* Mecanismo rebaixado + invariante read-only (bastidor) */}
        <p className="text-[10px] text-muted-foreground/60">
          read-only · não muta o ledger · <span className="font-mono">{scene.op}</span> ·{" "}
          <span className="font-mono">{shortHash(scene.projection_hash)}</span>
        </p>
      </div>
    </div>
  );
}

function ProcessViewRow({ view }: { readonly view: ProcessView }) {
  return (
    <li className="rounded border border-border/40 bg-background/40 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="min-w-0 flex-1 truncate text-foreground">{view.title}</span>
        <Pill className={RISK_TONE[view.risk]}>{view.risk}</Pill>
        {view.stuck ? <Pill className="bg-destructive/15 text-destructive">travado</Pill> : null}
        {view.waiting_on === "human" ? (
          <Pill className="bg-amber-500/15 text-amber-600 dark:text-amber-400">aguarda humano</Pill>
        ) : null}
        {view.state ? <Pill className="bg-muted text-muted-foreground">{view.state}</Pill> : null}
        <Pill className="bg-muted text-muted-foreground">{fmtAge(view.age_ms)}</Pill>
      </div>
      {view.open_findings.length > 0 ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {view.open_findings.length} achado(s): {view.open_findings.map((f) => f.kind).join(", ")}
        </p>
      ) : null}
    </li>
  );
}

function ProposalRow({ proposal }: { readonly proposal: Proposal }) {
  return (
    <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-xs">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-medium text-foreground">{proposal.label}</span>
        <Pill className="bg-background text-muted-foreground">{proposal.effect_class}</Pill>
        <Pill className="bg-background text-muted-foreground">airlock: {proposal.airlock}</Pill>
      </div>
      <p className="mt-0.5 text-muted-foreground">{proposal.reason}</p>
    </div>
  );
}
