const PENDING_CHAT_STORAGE_MAX_AGE_MS = 10 * 60 * 1000;
const PENDING_CHAT_STORAGE_PREFIX = "eve-chat-pending:";
const PROVISIONAL_CHAT_ID_PREFIX = "new-";

type StoredPendingAttachment = {
  readonly filename: string;
  readonly mediaType: string;
  readonly url: string;
};

type StoredPendingChat = {
  readonly attachments: readonly StoredPendingAttachment[];
  readonly createdAt: number;
  readonly pendingUserMessage: string;
  readonly version: 2;
};

export function createProvisionalChatId() {
  const randomId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${PROVISIONAL_CHAT_ID_PREFIX}${randomId}`;
}

export function isProvisionalChatId(chatId: string) {
  return chatId.startsWith(PROVISIONAL_CHAT_ID_PREFIX);
}

export function writePendingChatMessage(
  chatId: string,
  message: string,
  attachments: readonly StoredPendingAttachment[] = [],
) {
  const pendingUserMessage = message.trim();

  if ((!pendingUserMessage && attachments.length === 0) || typeof window === "undefined") {
    return false;
  }

  try {
    window.sessionStorage.setItem(
      getPendingChatStorageKey(chatId),
      JSON.stringify({
        attachments,
        createdAt: Date.now(),
        pendingUserMessage,
        version: 2,
      } satisfies StoredPendingChat),
    );
    return true;
  } catch {
    return false;
  }
}

export function readPendingChatMessage(chatId: string) {
  return readPendingChat(chatId)?.pendingUserMessage ?? null;
}

export function readPendingChatAttachments(chatId: string): readonly StoredPendingAttachment[] {
  return readPendingChat(chatId)?.attachments ?? [];
}

type PendingChat = {
  readonly attachments: readonly StoredPendingAttachment[];
  readonly pendingUserMessage: string | null;
};

export function readPendingChat(chatId: string): PendingChat | null {
  if (typeof window === "undefined") {
    return null;
  }

  const key = getPendingChatStorageKey(chatId);
  const stored = window.sessionStorage.getItem(key);

  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<StoredPendingChat>;
    const createdAt = Number(parsed.createdAt);
    const pendingUserMessage = parsed.pendingUserMessage?.trim();
    const attachments = Array.isArray(parsed.attachments) ? parsed.attachments : [];

    if (
      (!pendingUserMessage && attachments.length === 0) ||
      !Number.isFinite(createdAt) ||
      Date.now() - createdAt > PENDING_CHAT_STORAGE_MAX_AGE_MS
    ) {
      window.sessionStorage.removeItem(key);
      return null;
    }

    return {
      attachments: attachments.filter(
        (attachment): attachment is StoredPendingAttachment =>
          typeof attachment.filename === "string" &&
          typeof attachment.mediaType === "string" &&
          typeof attachment.url === "string",
      ),
      pendingUserMessage: pendingUserMessage || null,
    };
  } catch {
    window.sessionStorage.removeItem(key);
    return null;
  }
}

export function clearPendingChatMessage(chatId: string) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.removeItem(getPendingChatStorageKey(chatId));
}

function getPendingChatStorageKey(chatId: string) {
  return `${PENDING_CHAT_STORAGE_PREFIX}${chatId}`;
}
