// Tipos do motor Scene (Dynamic Projection, read-only).
// Port verbatim de `shared/tools/scene.ts` da fonte (dream-machine).
// Estes são o I/O do MOTOR (o que o engine consome e emite). O envelope de
// custódia de alto nível vive em `./types` (DynamicProjection).

export const SCENE_OPS = [
  "scene.open", "scene.drill", "scene.group", "scene.filter",
  "scene.ascend", "scene.descend", "scene.compare", "scene.refresh",
  "scene.back", "scene.explain_loss", "scene.open_evidence",
] as const;
export type SceneOp = (typeof SCENE_OPS)[number];

export const SALIENCE_CRITERIA = [
  "stuck", "waiting_on_human", "risk", "recency", "age", "severity", "blast_radius",
] as const;
export type SalienceCriterion = (typeof SALIENCE_CRITERIA)[number];
export type RankingProfile = SalienceCriterion[]; // ordered, highest-priority first

export type EffectClass = "none" | "reversible" | "compensable" | "irreversible";
export type WaitingOn = "human" | "process" | "none";
export type RiskTier = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

export type ProcessFlow = { current: string; next: string | null; doubt: string | null; fail: string | null };
export type LastShift = { actor: string; duration_ms: number; kind: string } | null;
export type OpenFinding = { kind: string; severity: string };

export type OAuthProcessMetadata = {
  client_name?: string;
  client_type?: string;
  lab_id?: string;
  client_metadata_hash?: string;
  request_hash?: string;
  redirect_uris?: string[];
  adapter_class?: string;
};

export type ProcessView = {
  id: string;            // logline content_hash — proof anchor
  instance: string;      // runtime_queue.queue_id / source_hash
  process_id: string;
  title: string;
  state: string;         // queue status: queued|claimed|closed|failed|released, or "" if no queue row
  flow: ProcessFlow;
  who: string;
  confirmed_by: string;
  waiting_on: WaitingOn;
  since_ms: number;      // time in current state
  age_ms: number;
  attempts: number;
  stuck: boolean;
  risk: RiskTier;
  oauth?: OAuthProcessMetadata;
  open_findings: OpenFinding[];
  last_shift: LastShift;
  event_zones: { live: number; buffered: number; evaporated: number };
  source_refs: string[]; // content_hash / board_act_hash / shift_hash
};

export type Freshness = {
  generated_at: string;
  as_of: string;
  stale: boolean;
  ttl_ms: number | null;
  source_watermark: { logline_seq: number; envelope_seq: number };
};

export type SceneView = {
  items: ProcessView[];
  order: string;
  filters: Record<string, unknown>;
  limit: number;
};

export type LossAccounting = {
  total_candidates: number;
  visible_count: number;
  omitted_count: number;
  omitted_reasons: string[];
  confidence_limits: string[];
};

export type LegalNextMove = {
  move: SceneOp;
  label: string;
  reason: string;
  args: Record<string, unknown>;
  effect_class: "none";        // read-only moves are always "none"
  requires_confirmation: false;
};

export type Proposal = {
  intent: string;
  label: string;
  reason: string;
  effect_class: EffectClass;
  airlock: string;
  args: Record<string, unknown>;
};

export type SceneWarning = {
  kind: "partial_source" | "scope_not_found" | "stale" | "mixed_jurisdiction";
  source?: "logline" | "envelope";
  message?: string;
};

export type SceneTransform = {
  source_hashes: string[];
  model: string | null;
  prompt_hash: string | null;
  params_hash: string | null;
  resolved_salience: string[];
  transform_spec_hash: string;
};

export type SceneScope = {
  ledger?: string;
  process?: string;
  process_id?: string;
  content_hash?: string;
  /** Conventional: authenticated principalId (userId) passed as stream_id for scoped reads. */
  stream_id?: string;
};

export type SceneRequest = {
  op: SceneOp;
  goal?: string;
  scope: SceneScope;
  parent_projection_hash?: string;
  selection?: { filter?: string; group_by?: string; focus?: string };
  as_of?: string;
  limit?: number;
};

export type SceneResponse = {
  projection_hash: string;
  parent_projection_hashes: string[];
  root_scope_hash: string;
  op: SceneOp;
  goal?: string;
  created_at: string;
  freshness: Freshness;
  warnings: SceneWarning[];
  view: SceneView;
  loss_accounting: LossAccounting;
  legal_next_moves: LegalNextMove[];
  proposals: Proposal[];
  transform: SceneTransform;
};

// Raw rows the readers return (the composer's input).
export type LoglineActRow = {
  content_hash: string; who: string; did: string; this: string;
  if_ok: string; if_doubt: string; if_not: string; status: string;
  confirmed_by: string; inserted_at: string;
  oauth?: OAuthProcessMetadata;
};
export type QueueRow = {
  queue_id: string; source_hash: string; process_id: string; status: string;
  attempts: number; claimed_by: string | null; created_at: string; updated_at: string;
  result_hash: string | null; last_error: string | null;
};
export type FindingRow = { finding_id: string; kind: string; severity: string; refs: string[]; resolved_at: number | null };
export type ShiftRow = { input_hash: string; actor: string; duration_ms: number; kind: string; closed_at: number };
export type SceneRawRows = {
  logline_acts: LoglineActRow[];
  queue: QueueRow[];
  findings: FindingRow[];
  shifts: ShiftRow[];
  watermark: { logline_seq: number; envelope_seq: number };
  risk_by_process?: Partial<Record<string, RiskTier>>;
  meta?: { logline_db_present?: boolean; envelope_db_present?: boolean };
};
