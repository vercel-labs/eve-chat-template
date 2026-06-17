"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createChatAction } from "@/app/actions/chat";
import {
  ComposerFooterControls,
  ErrorToast,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import { TemplateFooterLinks } from "@/components/chat/template-footer-links";
import { getChatMessageLengthError } from "@/lib/chat/limits";
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
  const mountedRef = useRef(false);
  const submittingRef = useRef(false);
  const setupReady = setupStatus.appReady;
  const pathname = usePathname();
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
    };
  }, []);

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

      if (!message || submittingRef.current) {
        return;
      }

      setClientError(null);

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      if (!setupReady) {
        setClientError(
          getHomeComposerDisabledReason({ setupStatus, submitting }) ??
            "Finish setup before chatting.",
        );
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setDraft("");

      let shouldResetSubmitting = true;

      try {
        const created = await createChatAction({ pendingUserMessage: message });
        const chatPath = `/chat/${created.id}`;

        router.prefetch(chatPath);
        touchChat(created);
        setActiveChatId(created.id);
        router.replace(chatPath, { scroll: false });
        shouldResetSubmitting = false;
      } catch (error) {
        setDraft(message);
        setClientError(error instanceof Error ? error.message : "Failed to start chat.");
      } finally {
        if (shouldResetSubmitting) {
          submittingRef.current = false;

          if (mountedRef.current) {
            setSubmitting(false);
          }
        }
      }
    },
    [
      requestSignIn,
      router,
      setActiveChatId,
      setupReady,
      setupStatus,
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

  if (pathname !== "/") {
    return null;
  }

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
  if (!setupStatus.databaseConfigured) {
    return "Connect Neon Postgres before chatting.";
  }

  if (!setupStatus.databaseSchemaReady) {
    return "Run database migrations: vercel env run -e production -- pnpm db:migrate.";
  }

  if (!setupStatus.authReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish auth setup before chatting.${missing}`;
  }

  if (!setupStatus.rateLimitReady) {
    return "Provision Upstash Redis before chatting.";
  }

  if (submitting) {
    return "Preparing chat.";
  }

  return undefined;
}
