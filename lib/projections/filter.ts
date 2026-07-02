import type { ProcessView, RiskTier, WaitingOn } from "./scene-types";

export type FilterClause =
  | { field: "stuck"; value: true }
  | { field: "waiting_on"; value: WaitingOn }
  | { field: "state"; value: string }
  | { field: "risk"; value: RiskTier | string }
  | { field: "process_id"; value: string }
  | { field: "status"; value: string };

const WAITING_ON = new Set<WaitingOn>(["human", "process", "none"]);

/** Parse `selection.filter` — comma-separated `key=value` or bare `stuck`. */
export function parseFilter(filter?: string): FilterClause[] | null {
  if (!filter?.trim()) return null;
  const clauses: FilterClause[] = [];
  for (const part of filter.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (part === "stuck") {
      clauses.push({ field: "stuck", value: true });
      continue;
    }
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!value) continue;
    switch (key) {
      case "waiting_on":
        if (WAITING_ON.has(value as WaitingOn)) {
          clauses.push({ field: "waiting_on", value: value as WaitingOn });
        }
        break;
      case "state":
        clauses.push({ field: "state", value });
        break;
      case "risk":
        clauses.push({ field: "risk", value });
        break;
      case "process_id":
        clauses.push({ field: "process_id", value });
        break;
      case "status":
        clauses.push({ field: "status", value });
        break;
      default:
        break;
    }
  }
  return clauses.length > 0 ? clauses : null;
}

function matchesClause(view: ProcessView, clause: FilterClause): boolean {
  switch (clause.field) {
    case "stuck":
      return view.stuck === clause.value;
    case "waiting_on":
      return view.waiting_on === clause.value;
    case "state":
      return view.state === clause.value;
    case "risk":
      return view.risk === clause.value;
    case "process_id":
      return view.process_id === clause.value;
    case "status":
      return view.flow.current.endsWith(`/${clause.value}`)
        || view.flow.current.includes(clause.value);
    default:
      return true;
  }
}

export function applyFilter(views: ProcessView[], clauses: FilterClause[]): ProcessView[] {
  return views.filter((view) => clauses.every((c) => matchesClause(view, c)));
}

const GROUP_KEYS = new Set(["process_id", "state", "waiting_on", "risk", "who"]);

function groupKey(view: ProcessView, groupBy: string): string {
  switch (groupBy) {
    case "process_id": return view.process_id;
    case "state": return view.state || "(no queue)";
    case "waiting_on": return view.waiting_on;
    case "risk": return view.risk;
    case "who": return view.who;
    default: return view.process_id;
  }
}

/** Collapse views into one representative per group dimension. */
export function groupProcessViews(
  views: ProcessView[],
  groupBy: string,
): ProcessView[] {
  const key = GROUP_KEYS.has(groupBy) ? groupBy : "process_id";
  const buckets = new Map<string, ProcessView[]>();
  for (const view of views) {
    const k = groupKey(view, key);
    const list = buckets.get(k) ?? [];
    list.push(view);
    buckets.set(k, list);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, members]) => {
      const rep = members[0]!;
      const count = members.length;
      return {
        ...rep,
        title: `${key}=${k} (${count} item${count === 1 ? "" : "s"})`,
        source_refs: [...new Set(members.flatMap((m) => m.source_refs))],
        open_findings: [...new Set(members.flatMap((m) => m.open_findings.map((f) => f.kind)))].map((kind) => ({
          kind,
          severity: "info",
        })),
      };
    });
}

/** Symmetric difference between baseline and a narrowed subset. */
export function compareProcessViews(
  baseline: ProcessView[],
  subset: ProcessView[],
): ProcessView[] {
  const subsetIds = new Set(subset.map((v) => v.id));
  const baselineIds = new Set(baseline.map((v) => v.id));
  const onlyBaseline = baseline.filter((v) => !subsetIds.has(v.id));
  const onlySubset = subset.filter((v) => !baselineIds.has(v.id));
  const shared = subset.filter((v) => baselineIds.has(v.id));

  const tag = (view: ProcessView, prefix: string): ProcessView => ({
    ...view,
    title: `${prefix} ${view.title}`,
  });

  return [
    ...onlyBaseline.map((v) => tag(v, "[baseline only]")),
    ...onlySubset.map((v) => tag(v, "[subset only]")),
    ...shared.map((v) => tag(v, "[both]")),
  ];
}
