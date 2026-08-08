"use client";

import type {
  ClientSessionState,
  EveAgentStoreSnapshot,
  EveMessageData,
  MessageStreamEvent,
} from "eve/client";
import { Client } from "eve/client";
import type { EveMessage } from "eve/react";
import { defaultMessageReducer, useEveAgent } from "eve/react";
import { track } from "@vercel/analytics";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  LockIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isChatTurnSettledEvent } from "@/lib/chat/events";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  appendClientChatEvents,
  checkClientSendLimit,
  clearClientChatPendingMessage,
  prepareClientChatSend,
  saveClientChatSession,
  saveClientChatSnapshot,
} from "@/lib/chat/persistence-client";
import type { ActiveChat, SetupStatus, Viewer } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

type AgentSnapshot = EveAgentStoreSnapshot<EveMessageData>;
type PendingPersistedEvent = {
  readonly event: MessageStreamEvent;
  readonly eventIndex: number;
};
type TurnTiming = {
  firstEventAt?: number;
  preflightFinishedAt?: number;
  readonly startedAt: number;
};

export type DraftHandlers = {
  readonly clearDraft: () => void;
  readonly restoreDraft: (value: string) => void;
};

export type AgentChatController = {
  readonly reset: () => void;
  readonly sendMessage: (text: string, draftHandlers: DraftHandlers) => Promise<void>;
  readonly stop: () => void;
};

export type AgentChatControllerStatus = {
  readonly disabledReason?: string;
  readonly isBusy: boolean;
  readonly isDisabled: boolean;
  readonly isEmpty: boolean;
};

const IDLE_CONTROLLER_STATUS: AgentChatControllerStatus = {
  isBusy: false,
  isDisabled: false,
  isEmpty: true,
};

const THINKING_EXIT_DURATION_MS = 180;
const STREAM_EVENT_BATCH_DELAY_MS = 500;

function reduceEventsToMessageData(
  events: readonly MessageStreamEvent[],
): EveMessageData {
  const reducer = defaultMessageReducer();
  let data = reducer.initial();

  for (const event of events) {
    data = reducer.reduce(data, event);
  }

  return data;
}

function hasOpenChatTurn(events: readonly MessageStreamEvent[]) {
  let open = false;

  for (const event of events) {
    if (event.type === "turn.started") {
      open = true;
    } else if (isChatTurnSettledEvent(event)) {
      open = false;
    }
  }

  return open;
}

function namespaceStreamEvent(
  event: MessageStreamEvent,
  namespace: string | undefined,
): MessageStreamEvent {
  if (!namespace) {
    return event;
  }

  if (!("data" in event) || typeof event.data !== "object" || !event.data) {
    return event;
  }

  const turnId =
    "turnId" in event.data && typeof event.data.turnId === "string"
      ? event.data.turnId
      : undefined;

  if (!turnId) {
    return event;
  }

  const prefix = `${namespace}:`;

  if (turnId.startsWith(prefix)) {
    return event;
  }

  return {
    ...event,
    data: {
      ...event.data,
      turnId: `${prefix}${turnId}`,
    },
  } as MessageStreamEvent;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function AgentChatSession({
  activeChat,
  chatId,
  emptyComposer,
  onActiveChatUpdated,
  onPendingUserMessageSettled,
  onControllerChange,
  pendingUserMessage,
}: {
  readonly activeChat: ActiveChat | null;
  readonly chatId?: string | null;
  readonly emptyComposer?: ReactNode;
  readonly onActiveChatUpdated?: (activeChat: ActiveChat) => void;
  readonly onPendingUserMessageSettled?: (message?: string) => void;
  readonly onControllerChange: (
    controller: AgentChatController | null,
    status: AgentChatControllerStatus,
  ) => void;
  readonly pendingUserMessage?: string | null;
}) {
  const {
    activeChatId: shellActiveChatId,
    requestSignIn,
    setActiveChatId: setShellActiveChatId,
    setupStatus,
    touchChat,
    viewer,
  } = useChatShell();
  const [activeChatId, setActiveChatId] = useState(activeChat?.id ?? chatId ?? null);
  const [currentTitle, setCurrentTitle] = useState(activeChat?.title ?? "New chat");
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [resumedEvents, setResumedEvents] = useState<MessageStreamEvent[]>([]);
  const [isResuming, setIsResuming] = useState(false);
  const [isFinalizingTurn, setIsFinalizingTurn] = useState(false);
  const [streamEvents, setStreamEvents] = useState<MessageStreamEvent[]>([]);
  const {
    clearMessage: clearLocalPendingUserMessage,
    message: localPendingUserMessage,
    messageRef: localPendingUserMessageRef,
    setMessage: setLocalPendingUserMessage,
  } = usePendingUserMessage();
  const activeChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const eventIndexRef = useRef(activeChat?.events.length ?? 0);
  const eventIndexChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const knownInitialEventsRef = useRef<readonly MessageStreamEvent[]>(
    activeChat?.events ?? [],
  );
  const currentTitleRef = useRef(activeChat?.title ?? "New chat");
  const resumeStartedRef = useRef(false);
  const resumedEventsRef = useRef<MessageStreamEvent[]>([]);
  const streamEventsRef = useRef<MessageStreamEvent[]>([]);
  const currentSessionRef = useRef<ClientSessionState | undefined>(activeChat?.session);
  const pendingEventBatchRef = useRef<PendingPersistedEvent[]>([]);
  const persistEventTimerRef = useRef<number | null>(null);
  const turnTimingRef = useRef<TurnTiming | null>(null);
  const eveClientRef = useRef<Client | null>(null);
  const currentTurnIdRef = useRef<string | undefined>(undefined);
  const cancellationRequestedRef = useRef(false);
  const cancellationSentTurnIdRef = useRef<string | undefined>(undefined);
  const failedSendRecoveryRef = useRef<(() => void) | null>(null);
  eveClientRef.current ??= new Client({ host: "" });
  const isSetupReady = setupStatus.appReady;
  const storageMode = setupStatus.storageMode;
  const router = useRouter();

  const cancelTurn = useCallback((turnId: string) => {
    const sessionId = currentSessionRef.current?.sessionId;

    if (!sessionId || cancellationSentTurnIdRef.current === turnId) {
      return;
    }

    cancellationSentTurnIdRef.current = turnId;

    void eveClientRef.current?.sessions
      .attach(sessionId)
      .cancel({ turnId })
      .catch((error: unknown) => {
        cancellationRequestedRef.current = false;
        cancellationSentTurnIdRef.current = undefined;
        setClientError(
          error instanceof Error ? error.message : "Failed to stop the response.",
        );
      });
  }, []);

  const requestCancellation = useCallback(() => {
    cancellationRequestedRef.current = true;
    setClientError(null);

    if (currentTurnIdRef.current) {
      cancelTurn(currentTurnIdRef.current);
    }
  }, [cancelTurn]);

  const startFinalizingTurn = useCallback(() => {
    setIsFinalizingTurn(true);
  }, []);

  const stopFinalizingTurn = useCallback(() => {
    setIsFinalizingTurn(false);
  }, []);

  const finishFinalizingTurn = useCallback(() => {
    setIsFinalizingTurn(false);
  }, []);

  const persistSnapshot = useCallback(
    async (snapshot: AgentSnapshot) => {
      const chatId = activeChatIdRef.current;
      const timing = turnTimingRef.current;

      if (timing) {
        const finishedAt = performance.now();
        track("Chat response timing", {
          firstEventMs: timing.firstEventAt
            ? Math.round(timing.firstEventAt - timing.startedAt)
            : null,
          preflightMs: timing.preflightFinishedAt
            ? Math.round(timing.preflightFinishedAt - timing.startedAt)
            : null,
          totalMs: Math.round(finishedAt - timing.startedAt),
        });
        turnTimingRef.current = null;
      }

      if (!viewer || !chatId) {
        stopFinalizingTurn();
        return;
      }

      if (!snapshot.session) {
        const recoverFailedSend = failedSendRecoveryRef.current;
        failedSendRecoveryRef.current = null;
        recoverFailedSend?.();
        void clearClientChatPendingMessage(storageMode, chatId).catch(() => {});
        stopFinalizingTurn();
        return;
      }

      setClientError(null);

      try {
        if (persistEventTimerRef.current !== null) {
          window.clearTimeout(persistEventTimerRef.current);
          persistEventTimerRef.current = null;
        }
        pendingEventBatchRef.current = [];

        const snapshotEvents =
          streamEventsRef.current.length > 0
            ? mergeStreamEventLogs(
                knownInitialEventsRef.current,
                streamEventsRef.current,
              )
            : preserveKnownInitialEvents(
                snapshot.events,
                knownInitialEventsRef.current,
              );
        const events = snapshotEvents;
        const session = snapshot.session;

        await saveClientChatSnapshot(storageMode, {
          chatId,
          events,
          session,
        });
        eventIndexRef.current = events.length;
        knownInitialEventsRef.current = events;
        streamEventsRef.current = [];
        setStreamEvents([]);
        touchChat({
          id: chatId,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });
        onActiveChatUpdated?.({
          events,
          id: chatId,
          pendingUserMessage: null,
          session,
          title: currentTitleRef.current,
        });
        onPendingUserMessageSettled?.();
        failedSendRecoveryRef.current = null;
        cancellationRequestedRef.current = false;
        cancellationSentTurnIdRef.current = undefined;
        currentTurnIdRef.current = undefined;
      } catch (error) {
        setClientError(error instanceof Error ? error.message : "Failed to save chat.");
      } finally {
        finishFinalizingTurn();
      }
    },
    [
      finishFinalizingTurn,
      onActiveChatUpdated,
      onPendingUserMessageSettled,
      stopFinalizingTurn,
      touchChat,
      storageMode,
      viewer,
    ],
  );

  const flushEventBatch = useCallback(async () => {
    const chatId = activeChatIdRef.current;
    const batch = pendingEventBatchRef.current;

    if (!viewer || !chatId || batch.length === 0) {
      return;
    }

    pendingEventBatchRef.current = [];

    try {
      await appendClientChatEvents(storageMode, { chatId, events: batch });
    } catch (error) {
      pendingEventBatchRef.current = [...batch, ...pendingEventBatchRef.current];
      setClientError(
        error instanceof Error ? error.message : "Failed to save stream progress.",
      );
    }
  }, [storageMode, viewer]);

  const persistStreamEvent = useCallback(
    (event: MessageStreamEvent) => {
      const displayEvent = namespaceStreamEvent(
        event,
        currentSessionRef.current?.sessionId,
      );

      if (event.type === "turn.started") {
        currentTurnIdRef.current = event.data.turnId;

        if (cancellationRequestedRef.current) {
          cancelTurn(event.data.turnId);
        }
      } else if (event.type === "message.received") {
        failedSendRecoveryRef.current = null;
      } else if (isChatTurnSettledEvent(event)) {
        currentTurnIdRef.current = undefined;
        cancellationRequestedRef.current = false;
        cancellationSentTurnIdRef.current = undefined;
      }
      const nextStreamEvents = appendUniqueStreamEvent(
        streamEventsRef.current,
        displayEvent,
      );

      if (nextStreamEvents !== streamEventsRef.current) {
        streamEventsRef.current = nextStreamEvents;
        setStreamEvents(nextStreamEvents);
      }

      const chatId = activeChatIdRef.current;

      if (!viewer || !chatId) {
        return;
      }

      if (turnTimingRef.current && !turnTimingRef.current.firstEventAt) {
        turnTimingRef.current.firstEventAt = performance.now();
      }

      const eventIndex = eventIndexRef.current;
      eventIndexRef.current += 1;
      pendingEventBatchRef.current.push({ event: displayEvent, eventIndex });

      if (persistEventTimerRef.current === null) {
        persistEventTimerRef.current = window.setTimeout(() => {
          persistEventTimerRef.current = null;
          void flushEventBatch();
        }, STREAM_EVENT_BATCH_DELAY_MS);
      }
    },
    [cancelTurn, flushEventBatch, viewer],
  );

  const persistSessionState = useCallback(
    async (session: ClientSessionState) => {
      const chatId = activeChatIdRef.current;

      if (!viewer || !chatId || !session.sessionId) {
        return;
      }

      try {
        await saveClientChatSession(storageMode, {
          chatId,
          session,
        });
      } catch (error) {
        setClientError(
          error instanceof Error ? error.message : "Failed to save session state.",
        );
      }
    },
    [storageMode, viewer],
  );

  const agent = useEveAgent({
    initialEvents: activeChat?.events ?? [],
    initialSession: activeChat?.session,
    onEvent: persistStreamEvent,
    onFinish: (snapshot) => {
      startFinalizingTurn();
      void persistSnapshot(snapshot);
    },
    onSessionChange: (session) => {
      currentSessionRef.current = session;

      if (session) {
        void persistSessionState(session);
      }
    },
  });

  const hasResumeOverlay = isResuming || (resumedEvents.length > 0 && streamEvents.length === 0);
  const resumedEventLog = useMemo(
    () => [...(activeChat?.events ?? []), ...resumedEvents],
    [activeChat?.events, resumedEvents],
  );
  const agentEventLog = useMemo(
    () => mergeStreamEventLogs(activeChat?.events ?? [], streamEvents),
    [activeChat?.events, streamEvents],
  );
  const displayEvents = hasResumeOverlay ? resumedEventLog : agentEventLog;
  const displayData = useMemo(() => reduceEventsToMessageData(displayEvents), [displayEvents]);
  const displayMessages = displayData.messages;
  const displayChatId = chatId ?? activeChatId ?? "new";
  const hasLocalPendingUserMessage = Boolean(localPendingUserMessage);
  const hasOpenTurn = useMemo(() => hasOpenChatTurn(displayEvents), [displayEvents]);
  const isBusy =
    isResuming ||
    hasLocalPendingUserMessage ||
    hasOpenTurn ||
    agent.status === "submitted" ||
    agent.status === "streaming";
  const isTurnBlocked = isBusy || isFinalizingTurn;
  const pendingMessage = pendingUserMessage
    ? createPendingUserMessage(displayChatId, pendingUserMessage)
    : null;
  const localPendingMessage = localPendingUserMessage
    ? createPendingUserMessage(
        displayChatId,
        localPendingUserMessage,
        "local-pending-user-message",
      )
    : null;
  const disabledReason = isFinalizingTurn ? "Finishing response." : undefined;
  const visibleMessages = appendPendingUserMessages(displayMessages, [
    pendingMessage,
    localPendingMessage,
  ]);
  const isEmpty = visibleMessages.length === 0 && !isTurnBlocked;
  const isChatRoute = Boolean(shellActiveChatId || chatId);
  const showThinking =
    Boolean(pendingMessage || localPendingMessage) || hasOpenTurn || isTurnBlocked;
  const thinkingPresence = useThinkingPresence(showThinking);
  const displayError = clientError ?? agent.error?.message ?? null;
  const toastError = displayError && dismissedError !== displayError ? displayError : null;

  const resetSession = useCallback(() => {
    agent.reset();
    setActiveChatId(null);
    activeChatIdRef.current = null;
    eventIndexRef.current = 0;
    eventIndexChatIdRef.current = null;
    knownInitialEventsRef.current = [];
    setCurrentTitle("New chat");
    currentTitleRef.current = "New chat";
    resumeStartedRef.current = false;
    resumedEventsRef.current = [];
    streamEventsRef.current = [];
    currentSessionRef.current = undefined;
    currentTurnIdRef.current = undefined;
    cancellationRequestedRef.current = false;
    cancellationSentTurnIdRef.current = undefined;
    failedSendRecoveryRef.current = null;
    setResumedEvents([]);
    setStreamEvents([]);
    stopFinalizingTurn();
    clearLocalPendingUserMessage();
    setIsResuming(false);
    setClientError(null);
  }, [agent, clearLocalPendingUserMessage, stopFinalizingTurn]);

  const prepareSend = useCallback(
    async (firstMessage: string) => {
      const result = await prepareClientChatSend(storageMode, {
        chatId: activeChatIdRef.current ?? undefined,
        message: firstMessage,
      });

      if (!result.allowed) {
        setClientError(`${result.message} Retry in ${result.retryAfter}s.`);
        return false;
      }

      const preparedChat = result.chat;
      touchChat(preparedChat);

      if (!activeChatIdRef.current) {
        setActiveChatId(preparedChat.id);
        setShellActiveChatId(preparedChat.id);
        activeChatIdRef.current = preparedChat.id;
        eventIndexChatIdRef.current = preparedChat.id;
        eventIndexRef.current = 0;
        knownInitialEventsRef.current = [];
        setCurrentTitle(preparedChat.title);
        currentTitleRef.current = preparedChat.title;
        router.replace(`/chat/${preparedChat.id}`, { scroll: false });
      } else if (preparedChat.title !== currentTitleRef.current) {
        setCurrentTitle(preparedChat.title);
        currentTitleRef.current = preparedChat.title;
      }

      return true;
    },
    [router, setShellActiveChatId, storageMode, touchChat],
  );

  const sendMessage = useCallback(
    async (text: string, draftHandlers: DraftHandlers) => {
      const message = text.trim();

      if (!message || isTurnBlocked || localPendingUserMessageRef.current) {
        return;
      }

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        setClientError(lengthError);
        return;
      }

      const showLocalPendingMessage = () => {
        setLocalPendingUserMessage(message);
        draftHandlers.clearDraft();
      };
      const restoreAfterFailedSend = (errorMessage?: string) => {
        clearLocalPendingUserMessage();
        draftHandlers.restoreDraft(message);

        if (errorMessage) {
          setClientError(errorMessage);
        }
      };
      let ready = false;

      setClientError(null);

      if (!isSetupReady) {
        setClientError("Finish setup before chatting.");
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      resumedEventsRef.current = [];
      setResumedEvents([]);
      setIsResuming(false);
      showLocalPendingMessage();
      onPendingUserMessageSettled?.(message);
      turnTimingRef.current = { startedAt: performance.now() };
      cancellationRequestedRef.current = false;
      cancellationSentTurnIdRef.current = undefined;
      currentTurnIdRef.current = undefined;
      failedSendRecoveryRef.current = restoreAfterFailedSend;

      try {
        ready = await prepareSend(message);
        if (turnTimingRef.current) {
          turnTimingRef.current.preflightFinishedAt = performance.now();
        }
      } catch (error) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;
        restoreAfterFailedSend(
          error instanceof Error ? error.message : "Failed to prepare chat.",
        );
        return;
      }

      if (!ready) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;
        const chatId = activeChatIdRef.current;

        if (chatId) {
          void clearClientChatPendingMessage(storageMode, chatId);
        }
        restoreAfterFailedSend();
        return;
      }

      const chatId = activeChatIdRef.current;

      if (!chatId) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;
        restoreAfterFailedSend("Chat is still getting ready.");
        return;
      }

      try {
        await agent.send(message);
      } catch (error) {
        turnTimingRef.current = null;
        failedSendRecoveryRef.current = null;

        if (isAbortError(error)) {
          stopFinalizingTurn();
          return;
        }

        stopFinalizingTurn();
        void clearClientChatPendingMessage(storageMode, chatId);
        restoreAfterFailedSend(error instanceof Error ? error.message : "Failed to send message.");
      }
    },
    [
      agent,
      clearLocalPendingUserMessage,
      isSetupReady,
      isTurnBlocked,
      prepareSend,
      requestSignIn,
      setLocalPendingUserMessage,
      storageMode,
      stopFinalizingTurn,
      onPendingUserMessageSettled,
      viewer,
    ],
  );

  const handleInputResponses = useCallback(
    async (
      responses: readonly {
        readonly optionId?: string;
        readonly requestId: string;
        readonly text?: string;
      }[],
    ) => {
      if (isTurnBlocked) {
        return;
      }

      if (!viewer) {
        requestSignIn();
        return;
      }

      if (!activeChatIdRef.current) {
        setClientError("Start a chat before responding.");
        return;
      }

      const limit = await checkClientSendLimit(storageMode);

      if (!limit.allowed) {
        setClientError(`${limit.message} Retry in ${limit.retryAfter}s.`);
        return;
      }

      try {
        await agent.respond(responses);
      } catch (error) {
        stopFinalizingTurn();
        setClientError(error instanceof Error ? error.message : "Failed to send response.");
      }
    },
    [
      agent,
      isTurnBlocked,
      requestSignIn,
      stopFinalizingTurn,
      storageMode,
      viewer,
    ],
  );

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    const nextChatId = activeChat?.id ?? chatId ?? null;
    const nextTitle = activeChat?.title ?? "New chat";
    const nextEventIndex = activeChat?.events.length ?? 0;

    setActiveChatId(nextChatId);
    activeChatIdRef.current = nextChatId;
    currentSessionRef.current = activeChat?.session;
    if (eventIndexChatIdRef.current !== nextChatId) {
      eventIndexChatIdRef.current = nextChatId;
      eventIndexRef.current = nextEventIndex;
      knownInitialEventsRef.current = activeChat?.events ?? [];
      streamEventsRef.current = [];
      setStreamEvents([]);
      stopFinalizingTurn();
      clearLocalPendingUserMessage();
    } else if (!isTurnBlocked) {
      eventIndexRef.current = Math.max(eventIndexRef.current, nextEventIndex);
      if (activeChat) {
        knownInitialEventsRef.current = activeChat.events;
      }
    }
    setCurrentTitle(nextTitle);
    currentTitleRef.current = nextTitle;
  }, [
    activeChat?.events.length,
    activeChat?.id,
    activeChat?.title,
    chatId,
    clearLocalPendingUserMessage,
    isTurnBlocked,
    stopFinalizingTurn,
  ]);

  useEffect(() => {
    return () => {
      if (persistEventTimerRef.current !== null) {
        window.clearTimeout(persistEventTimerRef.current);
      }
      void flushEventBatch();
    };
  }, [flushEventBatch]);

  useEffect(() => {
    if (
      !viewer ||
      !activeChat?.session?.sessionId ||
      resumeStartedRef.current ||
      agent.status !== "ready"
    ) {
      return;
    }

    const abortController = new AbortController();
    const existingEvents = activeChat.events;
    const pendingMessageText = pendingUserMessage ?? null;
    const shouldResumeOpenTurn = hasOpenChatTurn(existingEvents);

    if (!pendingMessageText && !shouldResumeOpenTurn) {
      return;
    }

    const startIndex = existingEvents.length;
    const shouldIgnoreLeadingWaiting =
      pendingMessageText !== null &&
      !hasLatestUserMessage(
        reduceEventsToMessageData(existingEvents).messages,
        pendingMessageText,
      );
    const session = new Client({ host: "" }).sessions.attach(
      activeChat.session.sessionId,
      { streamIndex: startIndex },
    );
    let cancelled = false;
    let completed = false;

    resumeStartedRef.current = true;
    resumedEventsRef.current = [];
    setResumedEvents([]);
    setIsResuming(true);
    setClientError(null);

    void (async () => {
      try {
        const resumeStreamOptions = {
          signal: abortController.signal,
          startIndex,
        };
        let isFirstEvent = true;

        for await (const event of session.stream(resumeStreamOptions)) {
          if (cancelled) {
            return;
          }

          if (isFirstEvent && shouldIgnoreLeadingWaiting && event.type === "session.waiting") {
            isFirstEvent = false;
            continue;
          }
          isFirstEvent = false;

          const displayEvent = namespaceStreamEvent(
            event,
            activeChat.session?.sessionId,
          );
          const nextEvents = [...resumedEventsRef.current, displayEvent];
          resumedEventsRef.current = nextEvents;
          setResumedEvents(nextEvents);

          if (isChatTurnSettledEvent(event)) {
            break;
          }
        }

        if (cancelled) {
          return;
        }

        const newEvents = resumedEventsRef.current;
        const allEvents = [...existingEvents, ...newEvents];

        if (!newEvents.some(isChatTurnSettledEvent)) {
          setClientError("Stream disconnected before the response completed.");
          return;
        }

        await saveClientChatSnapshot(storageMode, {
          chatId: activeChat.id,
          events: allEvents,
          session: session.state,
        });
        eventIndexRef.current = allEvents.length;
        knownInitialEventsRef.current = allEvents;
        resumedEventsRef.current = [];
        setResumedEvents([]);
        touchChat({
          id: activeChat.id,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });
        onActiveChatUpdated?.({
          events: allEvents,
          id: activeChat.id,
          pendingUserMessage: null,
          session: session.state,
          title: currentTitleRef.current,
        });

        onPendingUserMessageSettled?.();
        completed = true;
      } catch (error) {
        if (!cancelled && !isAbortError(error)) {
          setClientError(error instanceof Error ? error.message : "Failed to resume stream.");
        }
      } finally {
        if (!cancelled) {
          setIsResuming(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (!completed) {
        resumeStartedRef.current = false;
      }
      abortController.abort();
    };
  }, [
    activeChat?.events,
    activeChat?.id,
    activeChat?.session,
    agent.status,
    onActiveChatUpdated,
    onPendingUserMessageSettled,
    pendingUserMessage,
    storageMode,
    touchChat,
    viewer,
  ]);

  useEffect(() => {
    currentTitleRef.current = currentTitle;
  }, [currentTitle]);

  useEffect(() => {
    setDismissedError(null);
  }, [displayError]);

  useEffect(() => {
    if (
      localPendingUserMessage &&
      hasLatestUserMessage(displayMessages, localPendingUserMessage)
    ) {
      clearLocalPendingUserMessage();
    }
  }, [clearLocalPendingUserMessage, displayMessages, localPendingUserMessage]);

  useEffect(() => {
    onControllerChange(
      {
        reset: resetSession,
        sendMessage,
        stop: requestCancellation,
      },
      {
        disabledReason,
        isBusy,
        isDisabled: !isSetupReady || isFinalizingTurn,
        isEmpty,
      },
    );
  }, [
    disabledReason,
    isBusy,
    isFinalizingTurn,
    isEmpty,
    isSetupReady,
    onControllerChange,
    requestCancellation,
    resetSession,
    sendMessage,
  ]);

  useEffect(() => {
    return () => {
      onControllerChange(null, IDLE_CONTROLLER_STATUS);
    };
  }, [onControllerChange]);

  return (
    <>
      {toastError ? (
        <ErrorToast
          message={toastError}
          onDismiss={() => setDismissedError(toastError)}
        />
      ) : null}

      {isEmpty && !activeChatId && !isChatRoute && emptyComposer ? (
        <EmptyChatBody composer={emptyComposer} />
      ) : (
        <>
          {isChatRoute ? (
            <SessionHeader />
          ) : null}
          {isEmpty ? (
            <BlankChatBody />
          ) : (
            <ChatConversation>
              <ChatConversationContent>
                {visibleMessages.map((message, index) => (
                  <AgentMessage
                    canRespond={
                      !isTurnBlocked && Boolean(viewer) && isSetupReady
                    }
                    isStreaming={
                      agent.status === "streaming" && index === visibleMessages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={handleInputResponses}
                  />
                ))}
                {thinkingPresence.shouldRender ? (
                  <ThinkingMessage isVisible={thinkingPresence.isVisible} />
                ) : null}
              </ChatConversationContent>
              <ChatScrollButton />
            </ChatConversation>
          )}
        </>
      )}
    </>
  );
}

function mergeStreamEventLogs(
  events: readonly MessageStreamEvent[],
  streamedEvents: readonly MessageStreamEvent[],
): MessageStreamEvent[] {
  if (streamedEvents.length === 0) {
    return events as MessageStreamEvent[];
  }

  let merged: MessageStreamEvent[] = [...events];

  for (const event of streamedEvents) {
    const next = appendUniqueStreamEvent(merged, event);

    if (next !== merged) {
      merged = next;
    }
  }

  return merged;
}

function appendUniqueStreamEvent(
  events: readonly MessageStreamEvent[],
  event: MessageStreamEvent,
): MessageStreamEvent[] {
  if (events.some((existingEvent) => areSameStreamEvent(existingEvent, event))) {
    return events as MessageStreamEvent[];
  }

  return [...events, event];
}

function preserveKnownInitialEvents(
  snapshotEvents: readonly MessageStreamEvent[],
  knownEvents: readonly MessageStreamEvent[],
) {
  if (knownEvents.length === 0) {
    return snapshotEvents;
  }

  if (snapshotEvents.length === 0) {
    return knownEvents;
  }

  const sharedPrefixLength = countSharedEventPrefix(snapshotEvents, knownEvents);

  if (sharedPrefixLength === knownEvents.length) {
    return snapshotEvents;
  }

  if (sharedPrefixLength === snapshotEvents.length) {
    return knownEvents;
  }

  if (sharedPrefixLength > 0) {
    return [...knownEvents, ...snapshotEvents.slice(sharedPrefixLength)];
  }

  return [...knownEvents, ...snapshotEvents];
}

function countSharedEventPrefix(
  events: readonly MessageStreamEvent[],
  knownEvents: readonly MessageStreamEvent[],
) {
  const count = Math.min(events.length, knownEvents.length);

  for (let index = 0; index < count; index += 1) {
    if (!areSameStreamEvent(knownEvents[index]!, events[index])) {
      return index;
    }
  }

  return count;
}

function areSameStreamEvent(
  left: MessageStreamEvent,
  right: MessageStreamEvent | undefined,
) {
  return right !== undefined && areEqualJsonValues(left, right);
}

function areEqualJsonValues(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (typeof left !== typeof right || left === null || right === null) {
    return false;
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((item, index) => areEqualJsonValues(item, right[index]));
  }

  if (typeof left !== "object" || typeof right !== "object") {
    return false;
  }

  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);

  if (leftKeys.length !== rightKeys.length) {
    return false;
  }

  return leftKeys.every(
    (key) =>
      Object.prototype.hasOwnProperty.call(rightRecord, key) &&
      areEqualJsonValues(leftRecord[key], rightRecord[key]),
  );
}

function appendPendingUserMessages(
  messages: readonly EveMessageData["messages"][number][],
  pendingMessages: readonly (EveMessage | null)[],
) {
  let nextMessages = messages;

  for (const pendingMessage of pendingMessages) {
    const pendingText = pendingMessage ? getMessageText(pendingMessage) : null;

    if (!pendingMessage || !pendingText || hasLatestUserMessage(nextMessages, pendingText)) {
      continue;
    }

    nextMessages = [...nextMessages, pendingMessage];
  }

  return nextMessages;
}

function createPendingUserMessage(
  chatId: string,
  text: string,
  idSuffix = "pending-user-message",
): EveMessage {
  return {
    id: `${chatId}:${idSuffix}`,
    metadata: {
      optimistic: true,
      status: "submitted",
    },
    parts: [
      {
        state: "done",
        text,
        type: "text",
      },
    ],
    role: "user",
  };
}

function usePendingUserMessage() {
  const [message, setMessageState] = useState<string | null>(null);
  const messageRef = useRef<string | null>(null);

  const setMessage = useCallback((nextMessage: string | null) => {
    messageRef.current = nextMessage;
    setMessageState(nextMessage);
  }, []);

  const clearMessage = useCallback(() => {
    setMessage(null);
  }, [setMessage]);

  return { clearMessage, message, messageRef, setMessage };
}

function useThinkingPresence(active: boolean) {
  const [shouldRender, setShouldRender] = useState(active);
  const [isVisible, setIsVisible] = useState(active);

  useEffect(() => {
    if (active) {
      setShouldRender(true);

      const frame = window.requestAnimationFrame(() => {
        setIsVisible(true);
      });

      return () => {
        window.cancelAnimationFrame(frame);
      };
    }

    setIsVisible(false);

    const timeout = window.setTimeout(() => {
      setShouldRender(false);
    }, THINKING_EXIT_DURATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [active]);

  return { isVisible, shouldRender };
}

function ThinkingMessage({ isVisible }: { readonly isVisible: boolean }) {
  return (
    <article
      aria-live={isVisible ? "polite" : "off"}
      className={[
        "flex w-full justify-start overflow-hidden transition-[opacity,transform,max-height] duration-200 ease-out",
        isVisible ? "max-h-8 translate-y-0 opacity-100" : "max-h-0 -translate-y-1 opacity-0",
      ].join(" ")}
      role="status"
    >
      <div className="px-3 text-[15px] font-medium leading-6 text-muted-foreground">
        <span className="shimmer-text">Thinking...</span>
      </div>
    </article>
  );
}

function SessionHeader() {
  return <div className="h-12 shrink-0" />;
}

function BlankChatBody() {
  return <div className="min-h-0 flex-1" />;
}

export function EmptyChatBody({ composer }: { readonly composer?: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col pt-14 md:pt-8">
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <div className="w-full max-w-2xl space-y-8 sm:space-y-10 md:space-y-12">
          <h1 className="flex justify-center">
            <img
              alt="eve"
              className="size-16 select-none invert sm:size-20 md:size-24 dark:invert-0"
              draggable={false}
              src="/eve.svg"
            />
          </h1>
          {composer}
        </div>
      </div>
    </div>
  );
}

export function ErrorToast({
  message,
  onDismiss,
}: {
  readonly message: string;
  readonly onDismiss: () => void;
}) {
  return (
    <div
      aria-live="assertive"
      className="fixed top-3 right-3 z-50 flex w-[calc(100vw-1.5rem)] max-w-sm items-start gap-3 rounded-md border border-destructive/30 bg-background/95 p-3 text-sm shadow-lg backdrop-blur sm:top-4 sm:right-4"
      role="alert"
    >
      <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">Request failed</p>
        <p className="mt-0.5 text-muted-foreground">{message}</p>
      </div>
      <Button
        aria-label="Dismiss error"
        className="-mt-1 -mr-1 text-muted-foreground hover:text-foreground"
        onClick={onDismiss}
        size="icon-xs"
        type="button"
        variant="ghost"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
}

export function ComposerFooterControls({
  setupStatus,
}: {
  readonly setupStatus: SetupStatus;
}) {
  return <ComposerHint setupStatus={setupStatus} />;
}

function ComposerHint({ setupStatus }: { readonly setupStatus: SetupStatus }) {
  if (!setupStatus.appReady) {
    const reason = getSetupRequiredReason(setupStatus);

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-md px-2 text-[15px] text-muted-foreground/50"
            tabIndex={0}
          >
            <LockIcon className="size-3.5 shrink-0" />
            <span className="truncate">Setup required</span>
            <ChevronDownIcon className="size-3.5 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{reason}</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}

function getSetupRequiredReason(setupStatus: SetupStatus) {
  return setupStatus.missing.length
    ? `Finish setup. Missing: ${setupStatus.missing.join(", ")}.`
    : "Finish setup before chatting.";
}

function hasLatestUserMessage(
  messages: readonly EveMessageData["messages"][number][],
  text: string,
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message?.role !== "user") {
      continue;
    }

    return getMessageText(message) === text.trim();
  }

  return false;
}

function getMessageText(message: EveMessageData["messages"][number]) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();

  return text || null;
}
