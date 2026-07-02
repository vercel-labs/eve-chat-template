import type { HandleMessageStreamEvent, SessionState } from "eve/client";

export type Viewer = {
  readonly email: string;
  readonly id: string;
  readonly image: string | null;
  readonly isAnonymous: boolean;
  readonly name: string;
};

export type ChatListItem = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

export type ChatListPage = {
  readonly items: readonly ChatListItem[];
  readonly nextCursor: string | null;
};

export type Attachment = {
  readonly id: string;
  readonly filename: string;
  readonly mediaType: string;
  readonly size: number;
  readonly url: string;
};

export type ActiveChat = {
  readonly attachments: readonly Attachment[];
  readonly events: readonly HandleMessageStreamEvent[];
  readonly id: string;
  readonly pendingUserMessage: string | null;
  readonly session: SessionState | undefined;
  readonly title: string;
};

export type SetupStatus = {
  readonly appReady: boolean;
  readonly authReady: boolean;
  readonly databaseConfigured: boolean;
  readonly databaseReady: boolean;
  readonly databaseSchemaReady: boolean;
  readonly missing: readonly string[];
  readonly rateLimitReady: boolean;
};
