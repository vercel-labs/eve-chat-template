import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { toolAuditLog } from "@/lib/db/schema";

export async function logToolCall(
  userId: string,
  toolName: string,
  input: unknown,
  result: unknown,
) {
  await db.insert(toolAuditLog).values({
    id: randomUUID(),
    userId,
    toolName,
    input: JSON.stringify(input, null, 2),
    result: JSON.stringify(result, null, 2),
  });
}

export async function listAuditLogForUser(userId: string, limit = 50) {
  return db
    .select({
      id: toolAuditLog.id,
      toolName: toolAuditLog.toolName,
      input: toolAuditLog.input,
      result: toolAuditLog.result,
      createdAt: toolAuditLog.createdAt,
    })
    .from(toolAuditLog)
    .where(eq(toolAuditLog.userId, userId))
    .orderBy(desc(toolAuditLog.createdAt))
    .limit(limit);
}
