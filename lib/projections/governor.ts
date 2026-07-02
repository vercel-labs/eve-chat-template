import type {
  RankingProfile,
  SalienceCriterion,
  ProcessView,
  LossAccounting,
  LegalNextMove,
  Proposal,
} from "./scene-types";

const FALLBACK: RankingProfile = ["stuck", "waiting_on_human", "risk", "recency"];

const HINTS: Array<{ re: RegExp; crit: SalienceCriterion }> = [
  { re: /trav|stuck|parad|emperr|fail|falh/i, crit: "stuck" },
  { re: /aprova|approval|esperando|waiting|precisa de mim|minha/i, crit: "waiting_on_human" },
  { re: /risc|risk|perig|danger|escap|blast/i, crit: "risk" },
  { re: /mud|chang|recent|ontem|hoje|novo|delta/i, crit: "recency" },
  { re: /antig|old|age|idade|tempo/i, crit: "age" },
  { re: /sever|grav|critical|cr[ií]tic/i, crit: "severity" },
];

export function resolveSalience(goal: string | undefined): RankingProfile {
  if (!goal || !goal.trim()) return [...FALLBACK];
  const hit: SalienceCriterion[] = [];
  for (const { re, crit } of HINTS) {
    if (re.test(goal) && !hit.includes(crit)) hit.push(crit);
  }
  if (hit.length === 0) return [...FALLBACK];
  for (const c of FALLBACK) if (!hit.includes(c)) hit.push(c);
  return hit;
}

const RISK_RANK: Record<string, number> = { L0: 0, L1: 1, L2: 2, L3: 3, L4: 4, L5: 5 };

function score(v: ProcessView, crit: SalienceCriterion): number {
  switch (crit) {
    case "stuck": return v.stuck ? 1 : 0;
    case "waiting_on_human": return v.waiting_on === "human" ? 1 : 0;
    case "risk": return RISK_RANK[v.risk] ?? 0;
    case "recency": return v.age_ms;
    case "age": return v.age_ms;
    case "severity": return v.open_findings.some((f) => f.severity === "error") ? 2 : v.open_findings.length ? 1 : 0;
    case "blast_radius": return v.open_findings.length + (RISK_RANK[v.risk] ?? 0);
    default: return 0;
  }
}

export function rankAndBound(
  views: ProcessView[],
  profile: SalienceCriterion[],
  limit: number,
): { items: ProcessView[]; loss: LossAccounting } {
  const ranked = [...views].sort((a, b) => {
    for (const crit of profile) {
      let sa = score(a, crit);
      let sb = score(b, crit);
      if (crit === "recency") { sa = -sa; sb = -sb; }
      if (sb !== sa) return sb - sa;
    }
    return a.id.localeCompare(b.id);
  });
  const items = ranked.slice(0, limit);
  const omitted = ranked.length - items.length;
  const loss: LossAccounting = {
    total_candidates: views.length,
    visible_count: items.length,
    omitted_count: omitted,
    omitted_reasons: omitted > 0
      ? [`limit=${limit}`, `lower salience for profile [${profile.join(", ")}]`]
      : [],
    confidence_limits: [
      `Supports claims about these ${items.length} ranked items only, not all ${views.length}.`,
    ],
  };
  return { items, loss };
}

export type SceneState = {
  op: string;
  hasItems: boolean;
  hasParent: boolean;
  omitted: number;
  focused: boolean;
  itemCount: number;
  candidateCount: number;
  filtered: boolean;
};

export function legalMoves(s: SceneState): LegalNextMove[] {
  const m: LegalNextMove[] = [];
  const add = (move: LegalNextMove["move"], label: string, reason: string, args: Record<string, unknown> = {}) =>
    m.push({ move, label, reason, args, effect_class: "none", requires_confirmation: false });

  if (s.hasItems && !s.focused) {
    add("scene.drill", "Abrir um item", "Há itens na view.");
    if (s.candidateCount > 1) {
      add("scene.group", "Agrupar", "Resumir por dimensão.", { group_by: "process_id" });
    }
    add("scene.filter", "Filtrar", "Restringir a view.", { filter: "stuck" });
    add("scene.descend", "Aprofundar", "Focar o item mais saliente.");
  }
  add("scene.refresh", "Atualizar com novo objetivo", "Reconsultar com outro goal.");
  if (s.omitted > 0) add("scene.explain_loss", `Explicar os ${s.omitted} omitidos`, "A view é parcial.", { projection_hash: "self" });
  if (s.filtered) add("scene.compare", "Comparar filtro", "Ver diferença vs baseline.", { filter: "stuck" });
  if (s.focused) {
    add("scene.open_evidence", "Ver a prova", "Abrir os source refs do item.");
    add("scene.ascend", "Ampliar", "Subir e ver mais itens.");
  }
  if (s.hasParent) add("scene.back", "Voltar", "Subir um nível.");
  return m;
}

export function proposals(views: ProcessView[]): Proposal[] {
  const waiting = views.filter((v) => v.waiting_on === "human");
  if (waiting.length === 0) return [];
  return [{
    intent: "request_human_approval",
    label: `Pedir decisão humana para ${waiting.length} item(s)`,
    reason: `${waiting.length} item(s) waiting_on_human.`,
    effect_class: "reversible",
    airlock: "human-approval",
    args: { targets: waiting.map((v) => v.instance) },
  }];
}
