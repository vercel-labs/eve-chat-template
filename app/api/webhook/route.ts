import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createTask } from "@/lib/db/tasks";
import { createNotification } from "@/lib/db/notifications";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_SOURCE_LENGTH = 100;
const MAX_ASSIGNED_TO_LENGTH = 100;
const MAX_USER_EMAIL_LENGTH = 254;
const WEBHOOK_RATE_LIMIT = 60;
const WEBHOOK_WINDOW_SECONDS = 60;

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export async function POST(request: Request) {
  try {
    await enforceRateLimit({
      key: "global",
      limit: WEBHOOK_RATE_LIMIT,
      prefix: "webhook:create",
      windowSeconds: WEBHOOK_WINDOW_SECONDS,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: "Too many requests", retryAfter: error.retryAfter },
        { status: 429 },
      );
    }

    throw error;
  }

  const secret = process.env.WEBHOOK_SECRET?.trim();

  if (!secret) {
    return NextResponse.json({ error: "Webhook not configured" }, { status: 503 });
  }

  const auth = request.headers.get("authorization") ?? "";

  if (!auth.startsWith("Bearer ") || !safeEqual(auth.slice(7), secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title =
    typeof body.title === "string" ? body.title.trim().slice(0, MAX_TITLE_LENGTH) : "";

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  const userEmail =
    typeof body.userEmail === "string"
      ? body.userEmail.trim().slice(0, MAX_USER_EMAIL_LENGTH)
      : "";

  if (!userEmail) {
    return NextResponse.json({ error: "Missing userEmail" }, { status: 400 });
  }

  const description =
    typeof body.description === "string"
      ? body.description.slice(0, MAX_DESCRIPTION_LENGTH)
      : undefined;
  const assignTo =
    typeof body.assignTo === "string"
      ? body.assignTo.slice(0, MAX_ASSIGNED_TO_LENGTH)
      : undefined;
  const source =
    typeof body.source === "string" ? body.source.slice(0, MAX_SOURCE_LENGTH) : undefined;
  const notify = body.notify === true;

  const [targetUser] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, userEmail))
    .limit(1);

  if (!targetUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const task = await createTask(targetUser.id, {
    assignedTo: assignTo,
    description,
    title,
  });

  if (notify) {
    await createNotification(targetUser.id, {
      body: description,
      source: source ?? "webhook",
      title: `New task: ${title}`,
    });
  }

  return NextResponse.json({ id: task.id, notified: notify });
}
