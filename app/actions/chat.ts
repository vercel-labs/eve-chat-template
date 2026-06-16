"use server";

import type { HandleMessageStreamEvent, SessionState } from "eve/client";
import {
  appendChatEvent,
  clearChatPendingMessage,
  createChat,
  deleteChatForUser,
  listChatsByUser,
  markChatPendingMessage,
  maybeGetChatTitle,
  saveChatSnapshot,
  saveChatSessionState,
  skipChatAuthorization,
  updateChatTitle,
} from "@/lib/db/queries";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { getServerViewer } from "@/lib/session";
import { createFallbackTitle, DEFAULT_CHAT_TITLE, generateTitleWithEve } from "@/lib/chat/title";

const SEND_LIMIT = 25;
const SEND_WINDOW_SECONDS = 60 * 60;

export async function createChatAction(input?: { readonly pendingUserMessage?: string }) {
  const viewer = await requireViewer();

  await enforceRateLimit({
    key: viewer.id,
    limit: SEND_LIMIT,
    prefix: "chat:create",
    windowSeconds: SEND_WINDOW_SECONDS,
  });

  return createChat(viewer.id, {
    pendingUserMessage: input?.pendingUserMessage,
  });
}

export async function checkSendLimitAction() {
  const viewer = await requireViewer();

  try {
    await enforceRateLimit({
      key: viewer.id,
      limit: SEND_LIMIT,
      prefix: "chat:send",
      windowSeconds: SEND_WINDOW_SECONDS,
    });

    return { allowed: true as const };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        allowed: false as const,
        message: error.message,
        retryAfter: error.retryAfter,
      };
    }

    throw error;
  }
}

export async function saveChatSnapshotAction(input: {
  readonly chatId: string;
  readonly events: readonly HandleMessageStreamEvent[];
  readonly session: SessionState;
}) {
  const viewer = await requireViewer();

  await saveChatSnapshot({
    chatId: input.chatId,
    events: input.events,
    session: input.session,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function markChatPendingMessageAction(input: {
  readonly chatId: string;
  readonly message: string;
}) {
  const viewer = await requireViewer();

  return markChatPendingMessage({
    chatId: input.chatId,
    message: input.message,
    userId: viewer.id,
  });
}

export async function clearChatPendingMessageAction(chatId: string) {
  const viewer = await requireViewer();

  await clearChatPendingMessage({
    chatId,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function skipChatAuthorizationAction(input: {
  readonly chatId: string;
  readonly event: HandleMessageStreamEvent;
}) {
  const viewer = await requireViewer();

  return skipChatAuthorization({
    chatId: input.chatId,
    event: input.event,
    userId: viewer.id,
  });
}

export async function appendChatEventAction(input: {
  readonly chatId: string;
  readonly event: HandleMessageStreamEvent;
  readonly eventIndex: number;
}) {
  const viewer = await requireViewer();

  await appendChatEvent({
    chatId: input.chatId,
    event: input.event,
    eventIndex: input.eventIndex,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function saveChatSessionStateAction(input: {
  readonly chatId: string;
  readonly session: SessionState;
}) {
  const viewer = await requireViewer();

  await saveChatSessionState({
    chatId: input.chatId,
    session: input.session,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function generateChatTitleAction(input: {
  readonly chatId: string;
  readonly firstMessage: string;
}) {
  const viewer = await requireViewer();
  const currentTitle = await maybeGetChatTitle(input.chatId, viewer.id);

  if (currentTitle && currentTitle !== DEFAULT_CHAT_TITLE) {
    return { title: currentTitle };
  }

  let title = createFallbackTitle(input.firstMessage);

  try {
    title = await generateTitleWithEve(input.firstMessage);
  } catch {
    title = createFallbackTitle(input.firstMessage);
  }

  const updated = await updateChatTitle({
    chatId: input.chatId,
    title,
    userId: viewer.id,
  });

  return { title: updated.title };
}

export async function deleteChatAction(chatId: string) {
  const viewer = await requireViewer();

  await deleteChatForUser(chatId, viewer.id);

  return listChatsByUser(viewer.id);
}

async function requireViewer() {
  const viewer = await getServerViewer();

  if (!viewer) {
    throw new Error("Sign in with Vercel to continue.");
  }

  return viewer;
}
