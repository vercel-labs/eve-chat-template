import { randomUUID } from "node:crypto";
import { desc, eq, and } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { notification } from "@/lib/db/schema";

export async function createNotification(
  userId: string,
  input: {
    readonly body?: string;
    readonly source?: string;
    readonly title: string;
  },
) {
  const id = randomUUID();
  const title = input.title.trim();

  if (!title) {
    throw new Error("Notification title is required.");
  }

  const [row] = await db
    .insert(notification)
    .values({
      id,
      userId,
      title,
      body: input.body?.trim() || null,
      source: input.source?.trim() || null,
      read: false,
    })
    .returning({ id: notification.id, title: notification.title, read: notification.read });

  if (!row) {
    throw new Error("Failed to create notification.");
  }

  return row;
}

export async function listNotificationsForUser(userId: string, unreadOnly = false) {
  const conditions = [eq(notification.userId, userId)];

  if (unreadOnly) {
    conditions.push(eq(notification.read, false));
  }

  return db
    .select({
      id: notification.id,
      userId: notification.userId,
      title: notification.title,
      body: notification.body,
      read: notification.read,
      source: notification.source,
      createdAt: notification.createdAt,
    })
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(50);
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const [row] = await db
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.id, notificationId), eq(notification.userId, userId)))
    .returning({ id: notification.id, read: notification.read });

  if (!row) {
    throw new Error("Notification not found.");
  }

  return row;
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notification)
    .set({ read: true })
    .where(and(eq(notification.userId, userId), eq(notification.read, false)));
}
