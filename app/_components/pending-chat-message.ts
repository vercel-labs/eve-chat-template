export const PENDING_CHAT_MESSAGE_KEY = "eve-chat-pending-message";

export type PendingChatMessage = {
  readonly chatId: string;
  readonly message: string;
};

export function serializePendingChatMessage(message: PendingChatMessage) {
  return JSON.stringify(message);
}

export function parsePendingChatMessage(value: string | null): PendingChatMessage | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<PendingChatMessage>;

    if (typeof parsed.chatId !== "string" || typeof parsed.message !== "string") {
      return null;
    }

    const message = parsed.message.trim();

    if (!parsed.chatId || !message) {
      return null;
    }

    return {
      chatId: parsed.chatId,
      message,
    };
  } catch {
    return null;
  }
}
