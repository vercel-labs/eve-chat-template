"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ComposerFooterControls,
  ErrorToast,
  type AgentChatControllerStatus,
} from "@/app/_components/agent-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { uploadAttachment } from "@/app/actions/attachments";
import { createChatAction } from "@/app/actions/chat";
import { ChatComposer } from "@/components/chat/composer";
import type { PendingAttachment } from "@/components/chat/attachments";
import { TemplateFooterLinks } from "@/components/chat/template-footer-links";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  createProvisionalChatId,
  writePendingChatMessage,
} from "@/lib/chat/provisional-chat";
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
  const [attachments, setAttachmentsState] = useState<PendingAttachment[]>([]);
  const setAttachments = useCallback(
    (next: readonly PendingAttachment[]) => setAttachmentsState(next as PendingAttachment[]),
    [],
  );
  const [submitting, setSubmitting] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const submittingRef = useRef(false);
  const setupReady = setupStatus.appReady;
  const pathname = usePathname();
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    setActiveChatId(null);
  }, [setActiveChatId]);

  useEffect(() => {
    if (pathname === "/") {
      submittingRef.current = false;
      setSubmitting(false);
      setAttachments([]);
    }
  }, [pathname]);

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
    async ({ attachments: submitAttachments, text }: { readonly attachments: readonly PendingAttachment[]; readonly text: string }) => {
      const message = text.trim();

      if ((!message && submitAttachments.length === 0) || submittingRef.current) {
        return;
      }

      setClientError(null);

      if (message) {
        const lengthError = getChatMessageLengthError(message);

        if (lengthError) {
          setClientError(lengthError);
          return;
        }
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
      setAttachments([]);

      try {
        const created = await createChatAction({ pendingUserMessage: message || undefined });
        let uploadedAttachments: { readonly filename: string; readonly mediaType: string; readonly url: string }[] = [];

        if (submitAttachments.length > 0) {
          uploadedAttachments = await Promise.all(
            submitAttachments
              .filter((pending): pending is Extract<typeof pending, { type: "local" }> => pending.type === "local")
              .map((pending) => uploadAttachment({ chatId: created.id, file: pending.file })),
          );
        }

        const didStoreMessage = writePendingChatMessage(
          created.id,
          message,
          uploadedAttachments,
        );

        if (!didStoreMessage) {
          throw new Error("Failed to store pending chat.");
        }

        touchChat(created);
        setActiveChatId(created.id);
        router.push(`/chat/${created.id}`, { scroll: false });
      } catch (error) {
        submittingRef.current = false;
        setSubmitting(false);
        setDraft(message);
        setAttachments(submitAttachments);
        setClientError(error instanceof Error ? error.message : "Failed to start chat.");
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
                alt="eve"
                className="size-16 select-none invert sm:size-20 md:size-24 dark:invert-0"
                draggable={false}
                src="/eve.svg"
              />
            </h1>
            <ChatComposer
              attachments={attachments}
              autoFocus
              disabled={composerDisabled}
              disabledReason={composerDisabledReason}
              footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
              isBusy={IDLE_CONTROLLER_STATUS.isBusy}
              isPreparing={submitting}
              onAttachmentsChange={setAttachments}
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
