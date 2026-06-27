import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createTask } from "@/lib/db/tasks";
import { createNotification } from "@/lib/db/notifications";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const secret = process.env.WEBHOOK_SECRET?.trim();

  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization");

  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    readonly assignTo?: string;
    readonly description?: string;
    readonly notify?: boolean;
    readonly source?: string;
    readonly title?: string;
    readonly userEmail?: string;
  };

  const title = body.title?.trim();

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const [targetUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, body.userEmail?.trim() ?? ""))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const task = await createTask(targetUser.id, {
    assignedTo: body.assignTo,
    description: body.description,
    title,
  });

  if (body.notify) {
    await createNotification(targetUser.id, {
      body: body.description,
      source: body.source ?? "webhook",
      title: `New task: ${title}`,
    });
  }

  return NextResponse.json({ id: task.id, notified: Boolean(body.notify) });
}
