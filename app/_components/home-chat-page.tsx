"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { createChatAction } from "@/app/actions/chat";
import {
  ComposerFooterControls,
  ErrorToast,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import {
  PENDING_CHAT_MESSAGE_KEY,
  serializePendingChatMessage,
} from "@/app/_components/pending-chat-message";
import { ChatComposer } from "@/components/chat/composer";
import { TemplateFooterLinks } from "@/components/chat/template-footer-links";
import type { SetupStatus } from "@/lib/chat/types";

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
};

export function HomeChatPage() {
  const {
    requestSignIn,
    setActiveChatId,
    setupStatus,
    touchChat,
    viewer,
  } = useChatShell();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const setupReady = setupStatus.authReady && setupStatus.databaseReady;
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    setActiveChatId(null);
  }, [setActiveChatId]);

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
    setDismissedError(null);
  }, [clientError]);

  const handleSubmit = useCallback(
    async (text: string) => {
      const message = text.trim();

      if (!message || submitting) {
        return;
      }

      setClientError(null);

      if (!setupReady) {
        setClientError("Finish the required Neon and Better Auth setup before chatting.");
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      setSubmitting(true);
      setDraft("");

      try {
        const created = await createChatAction({ pendingUserMessage: message });
        const chatPath = `/chat/${created.id}`;

        window.sessionStorage.setItem(
          PENDING_CHAT_MESSAGE_KEY,
          serializePendingChatMessage({ chatId: created.id, message }),
        );
        router.prefetch(chatPath);
        touchChat(created);
        setActiveChatId(created.id);
        router.replace(chatPath, { scroll: false });
      } catch (error) {
        setDraft(message);
        setClientError(error instanceof Error ? error.message : "Failed to start chat.");
        setSubmitting(false);
      }
    },
    [
      requestSignIn,
      router,
      setActiveChatId,
      setupReady,
      submitting,
      touchChat,
      viewer,
    ],
  );

  const composerDisabled = !setupReady;
  const composerDisabledReason = getHomeComposerDisabledReason({
    setupStatus,
    submitting,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      {toastError ? (
        <ErrorToast
          message={toastError}
          onDismiss={() => setDismissedError(toastError)}
        />
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col justify-between px-4 pt-8 pb-4 sm:px-6 sm:pb-6">
        <div className="flex min-h-0 flex-1 items-center justify-center pb-20 sm:pb-[12vh]">
          <div className="w-full max-w-2xl space-y-5 sm:space-y-7 md:space-y-8">
            <h1 className="flex justify-center">
              <img
                alt="Eve"
                className="size-16 select-none invert sm:size-20 md:size-24 dark:invert-0"
                draggable={false}
                src="/eve.svg"
              />
            </h1>
            <ChatComposer
              autoFocus
              disabled={composerDisabled}
              disabledReason={composerDisabledReason}
              footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
              isBusy={IDLE_CONTROLLER_STATUS.isBusy}
              isPreparing={submitting}
              onChange={setDraft}
              onStop={() => {}}
              onSubmit={handleSubmit}
              placeholder="Ask anything..."
              value={draft}
            />
          </div>
        </div>
        <TemplateFooterLinks />
      </div>
    </div>
  );
}

function getHomeComposerDisabledReason({
  setupStatus,
  submitting,
}: {
  readonly setupStatus: SetupStatus;
  readonly submitting: boolean;
}) {
  if (!setupStatus.databaseReady) {
    return "Connect Neon Postgres before chatting.";
  }

  if (!setupStatus.authReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish auth setup before chatting.${missing}`;
  }

  if (submitting) {
    return "Preparing chat.";
  }

  return undefined;
}
