import type { ActiveChat, ChatListItem, Viewer } from "@/lib/chat/types";

export const CHAT_BOOTSTRAP_SYNC_EVENT = "eve-chat:bootstrap-sync";
export const CHAT_ROUTE_SYNC_EVENT = "eve-chat:route-sync";

export type ChatBootstrapSyncDetail = {
  readonly chats: readonly ChatListItem[];
  readonly nextCursor: string | null;
  readonly viewer: Viewer | null;
};

export type ChatRouteSyncDetail = {
  readonly activeChat: ActiveChat | null;
  readonly chatId: string | null;
};
