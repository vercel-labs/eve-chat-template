"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AgentChatSession,
  ComposerFooterControls,
  ErrorToast,
  type AgentChatController,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import {
  CHAT_ROUTE_SYNC_EVENT,
  type ChatRouteSyncDetail,
} from "@/app/_components/agent-chat-events";
import { useChatShell } from "@/app/_components/chat-shell-context";
import {
  parsePendingChatMessage,
  PENDING_CHAT_MESSAGE_KEY,
} from "@/app/_components/pending-chat-message";
import { ChatComposer } from "@/components/chat/composer";
import type { ActiveChat, SetupStatus } from "@/lib/chat/types";

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
};

export function SessionChatPage({
  chatId,
  children,
}: {
  readonly chatId: string;
  readonly children: ReactNode;
}) {
  const { setActiveChatId, setupStatus, viewer } = useChatShell();
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [draft, setDraft] = useState("");
  const [controllerReady, setControllerReady] = useState(false);
  const [controllerStatus, setControllerStatus] = useState(IDLE_CONTROLLER_STATUS);
  const [pendingUserMessage, setPendingUserMessage] = useState(() =>
    readPendingUserMessage(chatId),
  );
  const [lockedToClientSession, setLockedToClientSession] = useState(() =>
    Boolean(readPendingUserMessage(chatId)),
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const controllerRef = useRef<AgentChatController | null>(null);
  const pendingConsumedRef = useRef(false);
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    const nextPendingUserMessage = readPendingUserMessage(chatId);

    controllerRef.current = null;
    setControllerReady(false);
    setControllerStatus(IDLE_CONTROLLER_STATUS);
    setActiveChat(null);
    setDraft("");
    setPendingUserMessage(nextPendingUserMessage);
    setLockedToClientSession(Boolean(nextPendingUserMessage));
    pendingConsumedRef.current = false;
  }, [chatId]);

  useEffect(() => {
    setActiveChatId(chatId);

    return () => {
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    const applyRouteSync = (detail: ChatRouteSyncDetail) => {
      if (detail.chatId !== chatId) {
        return;
      }

      const storedPending = readPendingUserMessage(chatId);

      setActiveChat(detail.activeChat);
      setPendingUserMessage(storedPending ?? detail.activeChat?.pendingUserMessage ?? null);
    };
    const target = window as Window & {
      __eveChatRouteSync?: ChatRouteSyncDetail;
    };
    const handleRouteSync = (event: Event) => {
      applyRouteSync((event as CustomEvent<ChatRouteSyncDetail>).detail);
    };

    window.addEventListener(CHAT_ROUTE_SYNC_EVENT, handleRouteSync);
    if (target.__eveChatRouteSync) {
      applyRouteSync(target.__eveChatRouteSync);
    }

    return () => {
      window.removeEventListener(CHAT_ROUTE_SYNC_EVENT, handleRouteSync);
    };
  }, [chatId]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    }
  }, [viewer]);

  useEffect(() => {
    if (
      pendingConsumedRef.current ||
      !controllerReady ||
      controllerStatus.isBusy ||
      controllerStatus.isDisabled
    ) {
      return;
    }

    const storedPending = parsePendingChatMessage(
      window.sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY),
    );
    const pending = storedPending?.chatId === chatId ? storedPending : null;

    if (!pending || pending.chatId !== chatId) {
      return;
    }

    const controller = controllerRef.current;

    if (!controller) {
      return;
    }

    pendingConsumedRef.current = true;
    setLockedToClientSession(true);
    window.sessionStorage.removeItem(PENDING_CHAT_MESSAGE_KEY);

    void controller.sendMessage(pending.message, {
      clearDraft: () => setDraft(""),
      restoreDraft: (value) => {
        setPendingUserMessage(null);
        setLockedToClientSession(false);
        setDraft(value);
      },
    });
  }, [
    chatId,
    controllerReady,
    controllerStatus.isBusy,
    controllerStatus.isDisabled,
    pendingUserMessage,
  ]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

  const handleControllerChange = useCallback(
    (controller: AgentChatController | null, status: AgentChatControllerStatus) => {
      controllerRef.current = controller;
      setControllerReady(Boolean(controller));
      setControllerStatus((current) =>
        current.isBusy === status.isBusy &&
        current.isDisabled === status.isDisabled &&
        current.isEmpty === status.isEmpty
          ? current
          : status,
      );
    },
    [],
  );

  const handleComposerSubmit = useCallback(async (text: string) => {
    const controller = controllerRef.current;

    if (!controller) {
      setClientError("Chat is still getting ready.");
      return;
    }

    await controller.sendMessage(text, {
      clearDraft: () => setDraft(""),
      restoreDraft: setDraft,
    });
  }, []);

  const handleComposerStop = useCallback(() => {
    controllerRef.current?.stop();
  }, []);

  const handlePendingUserMessageSettled = useCallback(() => {
    setPendingUserMessage(null);
  }, []);

  const sessionKey = lockedToClientSession
    ? chatId
    : activeChat
      ? `${chatId}:loaded`
      : `${chatId}:blank`;
  const isLoadingChat = !activeChat && !lockedToClientSession;
  const composerDisabled =
    !setupStatus.authReady || !setupStatus.databaseReady || controllerStatus.isDisabled;
  const composerDisabledReason = getSessionComposerDisabledReason({
    controllerStatus,
    setupStatus,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toastError ? (
        <ErrorToast
          message={toastError}
          onDismiss={() => setDismissedError(toastError)}
        />
      ) : null}

      <AgentChatSession
        activeChat={activeChat}
        chatId={chatId}
        isLoadingChat={isLoadingChat}
        key={sessionKey}
        onPendingUserMessageSettled={handlePendingUserMessageSettled}
        onControllerChange={handleControllerChange}
        pendingUserMessage={pendingUserMessage}
      />

      <div className="shrink-0 pb-4 sm:pb-6">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <ChatComposer
            disabled={composerDisabled}
            disabledReason={composerDisabledReason}
            footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
            isBusy={controllerStatus.isBusy}
            onChange={setDraft}
            onStop={handleComposerStop}
            onSubmit={handleComposerSubmit}
            placeholder="Ask anything..."
            value={draft}
          />
        </div>
      </div>

      <div className="hidden" aria-hidden>
        {children}
      </div>
    </div>
  );
}

function getSessionComposerDisabledReason({
  controllerStatus,
  setupStatus,
}: {
  readonly controllerStatus: AgentChatControllerStatus;
  readonly setupStatus: SetupStatus;
}) {
  if (!setupStatus.databaseReady) {
    return "Connect Neon Postgres before chatting.";
  }

  if (controllerStatus.disabledReason) {
    return controllerStatus.disabledReason;
  }

  if (!setupStatus.authReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish auth setup before chatting.${missing}`;
  }

  if (controllerStatus.isDisabled) {
    return "Chat is unavailable.";
  }

  if (controllerStatus.isBusy) {
    return "Eve is responding.";
  }

  return undefined;
}

function readPendingUserMessage(chatId: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const pending = parsePendingChatMessage(
    window.sessionStorage.getItem(PENDING_CHAT_MESSAGE_KEY),
  );

  return pending?.chatId === chatId ? pending.message : null;
}
