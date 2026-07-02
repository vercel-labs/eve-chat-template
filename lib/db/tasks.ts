import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { task } from "@/lib/db/schema";

export async function createTask(
  userId: string,
  input: {
    readonly assignedTo?: string;
    readonly description?: string;
    readonly title: string;
  },
) {
  const id = randomUUID();
  const title = input.title.trim();

  if (!title) {
    throw new Error("Task title is required.");
  }

  const [row] = await db
    .insert(task)
    .values({
      id,
      userId,
      title,
      description: input.description?.trim() || null,
      assignedTo: input.assignedTo?.trim() || null,
      status: "open",
    })
    .returning({
      id: task.id,
      title: task.title,
      status: task.status,
    });

  if (!row) {
    throw new Error("Failed to create task.");
  }

  return row;
}

export async function listTasksForUser(userId: string, status?: string) {
  const conditions = [eq(task.userId, userId)];

  if (status) {
    conditions.push(eq(task.status, status));
  }

  return db
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      assignedTo: task.assignedTo,
      verificationNotes: task.verificationNotes,
      createdAt: task.createdAt,
    })
    .from(task)
    .where(and(...conditions))
    .orderBy(task.createdAt);
}

export async function completeTask(
  userId: string,
  taskId: string,
  verificationNotes?: string,
) {
  const [row] = await db
    .update(task)
    .set({
      status: "completed",
      updatedAt: new Date(),
      verificationNotes: verificationNotes?.trim() || null,
    })
    .where(and(eq(task.id, taskId), eq(task.userId, userId)))
    .returning({ id: task.id, title: task.title, status: task.status });

  if (!row) {
    throw new Error("Task not found.");
  }

  return row;
}

export async function verifyTask(userId: string, taskId: string) {
  const [row] = await db
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      status: task.status,
      assignedTo: task.assignedTo,
      verificationNotes: task.verificationNotes,
    })
    .from(task)
    .where(and(eq(task.id, taskId), eq(task.userId, userId)))
    .limit(1);

  if (!row) {
    throw new Error("Task not found.");
  }

  return {
    ...row,
    verified: row.status === "completed",
  };
}

export async function updateTaskStatus(
  userId: string,
  taskId: string,
  status: "open" | "in_progress" | "completed" | "verified",
) {
  const [row] = await db
    .update(task)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(task.id, taskId), eq(task.userId, userId)))
    .returning({ id: task.id, status: task.status });

  if (!row) {
    throw new Error("Task not found.");
  }

  return row;
}

export async function deleteTaskForUser(userId: string, taskId: string) {
  const [row] = await db
    .delete(task)
    .where(and(eq(task.id, taskId), eq(task.userId, userId)))
    .returning({ id: task.id, title: task.title });

  if (!row) {
    throw new Error("Task not found.");
  }

  return row;
}
