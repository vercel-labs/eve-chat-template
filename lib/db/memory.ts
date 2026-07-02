import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { memory } from "@/lib/db/schema";

export async function getMemoryForUser(userId: string) {
  const rows = await db
    .select({
      id: memory.id,
      key: memory.key,
      value: memory.value,
      source: memory.source,
      createdAt: memory.createdAt,
      updatedAt: memory.updatedAt,
    })
    .from(memory)
    .where(eq(memory.userId, userId))
    .orderBy(memory.key);

  return rows;
}

export async function getMemoryValue(userId: string, key: string) {
  const [row] = await db
    .select({ value: memory.value })
    .from(memory)
    .where(and(eq(memory.userId, userId), eq(memory.key, key)))
    .limit(1);

  return row?.value ?? null;
}

export async function setMemoryValue(
  userId: string,
  key: string,
  value: string,
  source?: string,
) {
  const trimmedKey = key.trim();
  const trimmedValue = value.trim();

  if (!trimmedKey || !trimmedValue) {
    throw new Error("Memory key and value are required.");
  }

  const [row] = await db
    .insert(memory)
    .values({
      id: randomUUID(),
      userId,
      key: trimmedKey,
      value: trimmedValue,
      source: source?.trim() || null,
    })
    .onConflictDoUpdate({
      set: {
        source: source?.trim() || null,
        updatedAt: new Date(),
        value: trimmedValue,
      },
      target: [memory.userId, memory.key],
    })
    .returning({
      id: memory.id,
      key: memory.key,
      value: memory.value,
      source: memory.source,
    });

  if (!row) {
    throw new Error("Failed to save memory.");
  }

  return row;
}

export async function deleteMemoryValue(userId: string, key: string) {
  await db
    .delete(memory)
    .where(and(eq(memory.userId, userId), eq(memory.key, key)));
}
