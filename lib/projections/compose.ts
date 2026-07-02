import type { SceneRawRows, ProcessView, RiskTier, WaitingOn, OpenFinding } from "./scene-types";

const TERMINAL = new Set(["closed", "released"]);
const STUCK_ATTEMPTS = 2;
const STUCK_AGE_MS: Record<RiskTier, number> = {
  L0: 3_600_000, L1: 3_600_000, L2: 1_800_000, L3: 900_000, L4: 300_000, L5: 300_000,
};

export type ComposeOpts = { now: number; riskByProcess: Record<string, RiskTier> };

function ms(iso: string): number { return Date.parse(iso); }

function deriveWaiting(status: string, confirmedBy: string, queueState: string): WaitingOn {
  if (TERMINAL.has(queueState)) return "none";
  if (status === "open" && confirmedBy) return "human";
  if (queueState === "queued" || queueState === "claimed") return "process";
  return "none";
}

export function composeProcessViews(rows: SceneRawRows, opts: ComposeOpts): ProcessView[] {
  const riskMap = { ...rows.risk_by_process, ...opts.riskByProcess };
  const findingsByRef = new Map<string, OpenFinding[]>();
  for (const f of rows.findings) {
    if (f.resolved_at !== null) continue;
    for (const ref of f.refs) {
      const list = findingsByRef.get(ref) ?? [];
      list.push({ kind: f.kind, severity: f.severity });
      findingsByRef.set(ref, list);
    }
  }
  const shiftByHash = new Map(rows.shifts.map((s) => [s.input_hash, s]));
  const queueByHash = new Map(rows.queue.map((q) => [q.source_hash, q]));

  return rows.logline_acts.map((act) => {
    const q = queueByHash.get(act.content_hash);
    const queueState = q?.status ?? "";
    const risk = riskMap[q?.process_id ?? ""]
      ?? riskMap[act.if_ok ?? ""]
      ?? "L1";
    const sinceMs = q ? opts.now - ms(q.updated_at) : opts.now - ms(act.inserted_at);
    const ageMs = opts.now - ms(act.inserted_at);
    const attempts = q?.attempts ?? 0;
    const stuck = !TERMINAL.has(queueState) && queueState !== ""
      && (attempts >= STUCK_ATTEMPTS || sinceMs > STUCK_AGE_MS[risk]);
    const shift = shiftByHash.get(act.content_hash) ?? null;
    return {
      id: act.content_hash,
      instance: q?.queue_id ?? act.content_hash,
      process_id: q?.process_id ?? act.if_ok ?? "unknown",
      title: act.this ? `${act.did}: ${act.this}` : act.did,
      state: queueState,
      ...(act.oauth ? { oauth: act.oauth } : {}),
      flow: {
        current: `${act.did}/${act.status}`,
        next: act.if_ok || null,
        doubt: act.if_doubt || null,
        fail: act.if_not || null,
      },
      who: act.who,
      confirmed_by: act.confirmed_by,
      waiting_on: deriveWaiting(act.status, act.confirmed_by, queueState),
      since_ms: sinceMs,
      age_ms: ageMs,
      attempts,
      stuck,
      risk,
      open_findings: findingsByRef.get(act.content_hash) ?? [],
      last_shift: shift ? { actor: shift.actor, duration_ms: shift.duration_ms, kind: shift.kind } : null,
      event_zones: { live: 0, buffered: 0, evaporated: 0 },
      source_refs: [act.content_hash, ...(shift ? [shift.input_hash] : [])].filter((v, i, a) => a.indexOf(v) === i),
    };
  });
}
