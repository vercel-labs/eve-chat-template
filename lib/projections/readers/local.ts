import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { task, toolAuditLog, notification } from "@/lib/db/schema";
import type { Task, ToolAuditLog, Notification } from "@/lib/db/schema";
import type { SceneReaders } from "./types";
import type {
  SceneRawRows,
  SceneScope,
  LoglineActRow,
  QueueRow,
  ShiftRow,
  FindingRow,
  RiskTier,
} from "../scene-types";

function mapStatus(status: string): string {
  switch (status) {
    case "open": return "queued";
    case "in_progress": return "claimed";
    case "done": return "closed";
    case "failed": return "failed";
    default: return "queued";
  }
}

function taskToLoglineAct(t: Task): LoglineActRow {
  return {
    content_hash: t.id,
    who: t.assignedTo ?? "user",
    did: t.title,
    this: t.description ?? "",
    status: t.status,
    confirmed_by: t.verificationNotes ? "user" : "",
    if_ok: "",
    if_doubt: "",
    if_not: "",
    inserted_at: t.createdAt.toISOString(),
  };
}

function taskToQueueRow(t: Task): QueueRow {
  return {
    queue_id: t.id,
    source_hash: t.id,
    process_id: t.id,
    status: mapStatus(t.status),
    attempts: 0,
    claimed_by: null,
    created_at: t.createdAt.toISOString(),
    updated_at: t.updatedAt.toISOString(),
    result_hash: null,
    last_error: null,
  };
}

function auditToShift(a: ToolAuditLog): ShiftRow {
  return {
    input_hash: a.id,
    actor: "agent",
    kind: a.toolName,
    duration_ms: 0,
    closed_at: Number(a.createdAt),
  };
}

function notificationToFinding(n: Notification): FindingRow {
  return {
    finding_id: n.id,
    kind: n.source ?? "alert",
    severity: "warn",
    refs: [],
    resolved_at: n.read ? Number(n.createdAt) : null,
  };
}

function deriveRiskByProcess(tasks: Task[]): Record<string, RiskTier> {
  const risk: Record<string, RiskTier> = {};
  const now = Date.now();
  for (const t of tasks) {
    if (t.status === "failed") {
      risk[t.id] = "L4";
    } else if (t.status === "open") {
      const ageMs = now - t.createdAt.getTime();
      if (ageMs > 7 * 24 * 60 * 60 * 1000) {
        risk[t.id] = "L3";
      } else {
        risk[t.id] = "L1";
      }
    } else {
      risk[t.id] = "L1";
    }
  }
  return risk;
}

async function listTasksForScene(userId: string, scope: SceneScope): Promise<Task[]> {
  const conditions = [eq(task.userId, userId)];
  if (scope.process_id) {
    conditions.push(eq(task.id, scope.process_id));
  }
  if (scope.process) {
    // partial match on title
    // drizzle-orm doesn't have a direct LIKE helper in all versions; use sql
    // but for simplicity, we'll skip text search here and let the engine filter
  }
  return db
    .select()
    .from(task)
    .where(and(...conditions))
    .orderBy(desc(task.updatedAt));
}

async function listAuditForScene(userId: string, _scope: SceneScope): Promise<ToolAuditLog[]> {
  return db
    .select()
    .from(toolAuditLog)
    .where(eq(toolAuditLog.userId, userId))
    .orderBy(desc(toolAuditLog.createdAt))
    .limit(100);
}

async function listFindingsForScene(userId: string, _scope: SceneScope): Promise<Notification[]> {
  return db
    .select()
    .from(notification)
    .where(and(eq(notification.userId, userId), eq(notification.read, false)))
    .orderBy(desc(notification.createdAt))
    .limit(50);
}

export const localSceneReader: SceneReaders = {
  async readRows(scope) {
    const userId = scope.stream_id;
    if (!userId) {
      // No user in scope — return empty but honest about DB presence
      return {
        logline_acts: [],
        queue: [],
        findings: [],
        shifts: [],
        watermark: { logline_seq: 0, envelope_seq: 0 },
        meta: { logline_db_present: true, envelope_db_present: true },
      };
    }
    const [tasks, audits, notes] = await Promise.all([
      listTasksForScene(userId, scope),
      listAuditForScene(userId, scope),
      listFindingsForScene(userId, scope),
    ]);
    return {
      logline_acts: tasks.map(taskToLoglineAct),
      queue: tasks.map(taskToQueueRow),
      findings: notes.map(notificationToFinding),
      shifts: audits.map(auditToShift),
      watermark: { logline_seq: tasks.length, envelope_seq: audits.length },
      risk_by_process: deriveRiskByProcess(tasks),
      meta: { logline_db_present: true, envelope_db_present: true },
    };
  },
};
