"use client";

import type {
  AuthorizationCompletedStreamEvent,
  AuthorizationRequiredStreamEvent,
  ClientSession,
  EveAgentStoreSnapshot,
  EveMessageData,
  HandleMessageStreamEvent,
  SendTurnInput,
  SessionState,
} from "eve/client";
import type { EveMessage } from "eve/react";
import { defaultMessageReducer, useEveAgent } from "eve/react";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  ExternalLinkIcon,
  LockIcon,
  PlugIcon,
  XIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  checkSendLimitAction,
  appendChatEventAction,
  clearChatPendingMessageAction,
  createChatAction,
  generateChatTitleAction,
  markChatPendingMessageAction,
  saveChatSnapshotAction,
  saveChatSessionStateAction,
  skipChatAuthorizationAction,
} from "@/app/actions/chat";
import {
  useChatShell,
  type EnabledConnections,
} from "@/app/_components/chat-shell-context";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { IntegrationsMenu } from "@/components/chat/integrations-menu";
import { AgentMessage } from "@/components/chat/message";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { isChatTurnSettledEvent } from "@/lib/chat/events";
import type { ActiveChat, SetupStatus, Viewer } from "@/lib/chat/types";

type AgentSnapshot = EveAgentStoreSnapshot<EveMessageData>;

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

const EVE_CREATE_SESSION_PATH = "/eve/v1/session";
const EVE_SESSION_ID_HEADER = "x-eve-session-id";
const STREAM_OPEN_RETRYABLE_STATUS = new Set([404, 409, 425, 500, 502, 503, 504]);
const THINKING_EXIT_DURATION_MS = 180;

function createPersistedClientSession({
  initialSession,
  onSessionStarted,
}: {
  readonly initialSession?: SessionState;
  readonly onSessionStarted: (session: SessionState) => Promise<void> | void;
}) {
  let session = initialSession ?? createInitialSessionState();

  return {
    get state() {
      return session;
    },
    async send(input: SendTurnInput) {
      const previousSession = session;
      const normalizedInput = normalizeSendInput(input);
      const response = await postSessionTurn(previousSession, normalizedInput);
      const startedSession = {
        ...previousSession,
        continuationToken: response.continuationToken ?? previousSession.continuationToken,
        sessionId: response.sessionId,
        streamIndex:
          previousSession.sessionId === response.sessionId ? previousSession.streamIndex : 0,
      };

      session = startedSession;

      await onSessionStarted(startedSession);

      return createBrowserMessageResponse({
        continuationToken: response.continuationToken,
        onFinalize: (events) => {
          session = advanceBrowserSession({
            baseStreamIndex: startedSession.streamIndex,
            continuationToken: response.continuationToken,
            events,
            session: startedSession,
            sessionId: response.sessionId,
          });
        },
        sessionId: response.sessionId,
        signal: normalizedInput.signal,
        startIndex: startedSession.streamIndex,
      });
    },
    stream(options?: Parameters<ClientSession["stream"]>[0]) {
      const sessionId = session.sessionId;

      if (!sessionId) {
        throw new Error("Session has no session ID. Send a message first.");
      }

      const startIndex = options?.startIndex ?? session.streamIndex;

      return streamSessionEvents({
        onFinalize: (events) => {
          session = advanceBrowserSession({
            baseStreamIndex: startIndex,
            continuationToken: session.continuationToken,
            events,
            session,
            sessionId,
          });
        },
        sessionId,
        signal: options?.signal,
        startIndex,
      });
    },
  } as unknown as ClientSession;
}

function createInitialSessionState(): SessionState {
  return { streamIndex: 0 };
}

function normalizeSendInput(input: SendTurnInput) {
  return typeof input === "string" ? { message: input } : input;
}

async function postSessionTurn(
  session: SessionState,
  input: ReturnType<typeof normalizeSendInput>,
) {
  const body = createHandleMessageBody({ input, session });

  if (!body) {
    throw new Error("Session turn requires a message or input response.");
  }

  const response = await fetch(
    session.sessionId
      ? `/eve/v1/session/${encodeURIComponent(session.sessionId)}`
      : EVE_CREATE_SESSION_PATH,
    {
      body: JSON.stringify(body),
      headers: {
        "content-type": "application/json",
        ...input.headers,
      },
      method: "POST",
      signal: input.signal ?? null,
    },
  );

  if (!response.ok) {
    throw new Error(await readResponseError(response));
  }

  const payload = await response.json() as {
    readonly continuationToken?: unknown;
    readonly sessionId?: unknown;
  };
  const sessionId =
    (typeof payload.sessionId === "string" ? payload.sessionId : undefined) ??
    response.headers.get(EVE_SESSION_ID_HEADER)?.trim();

  if (!sessionId) {
    throw new Error("Message route did not return a session id.");
  }

  return {
    continuationToken:
      typeof payload.continuationToken === "string"
        ? payload.continuationToken
        : undefined,
    sessionId,
  };
}

function createHandleMessageBody({
  input,
  session,
}: {
  readonly input: ReturnType<typeof normalizeSendInput>;
  readonly session: SessionState;
}) {
  const body: Record<string, unknown> = {};

  if (input.message !== undefined) {
    body.message = input.message;
  }

  if (input.inputResponses !== undefined && input.inputResponses.length > 0) {
    body.inputResponses = input.inputResponses;
  }

  if (input.clientContext !== undefined) {
    body.clientContext = input.clientContext;
  }

  if (input.outputSchema !== undefined) {
    body.outputSchema = input.outputSchema;
  }

  if (session.continuationToken !== undefined) {
    body.continuationToken = session.continuationToken;
  }

  if (Object.keys(body).length === 0) {
    return null;
  }

  if (session.continuationToken === undefined && body.message === undefined) {
    return null;
  }

  if (
    session.continuationToken !== undefined &&
    body.message === undefined &&
    body.inputResponses === undefined
  ) {
    return null;
  }

  return body;
}

function createBrowserMessageResponse({
  continuationToken,
  onFinalize,
  sessionId,
  signal,
  startIndex,
}: {
  readonly continuationToken?: string;
  readonly onFinalize: (events: readonly HandleMessageStreamEvent[]) => void;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly startIndex: number;
}) {
  let consumed = false;

  return {
    continuationToken,
    sessionId,
    [Symbol.asyncIterator]() {
      if (consumed) {
        throw new Error("MessageResponse has already been consumed.");
      }

      consumed = true;

      return streamSessionEvents({
        onFinalize,
        sessionId,
        signal,
        startIndex,
      })[Symbol.asyncIterator]();
    },
  };
}

async function* streamSessionEvents({
  onFinalize,
  sessionId,
  signal,
  startIndex,
}: {
  readonly onFinalize: (events: readonly HandleMessageStreamEvent[]) => void;
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly startIndex: number;
}) {
  const events: HandleMessageStreamEvent[] = [];
  let nextIndex = startIndex;
  let reconnectsRemaining = 3;

  try {
    for (;;) {
      let disconnected = false;
      const body = await openStreamBody({ sessionId, signal, startIndex: nextIndex });

      try {
        for await (const event of readNdjsonStream(body)) {
          events.push(event);
          nextIndex += 1;
          yield event;

          if (isChatTurnSettledEvent(event)) {
            return;
          }
        }
      } catch (error) {
        if (!isStreamDisconnectError(error)) {
          throw error;
        }

        disconnected = true;
      }

      if (!disconnected || signal?.aborted || reconnectsRemaining <= 0) {
        return;
      }

      reconnectsRemaining -= 1;
    }
  } finally {
    onFinalize(events);
  }
}

async function openStreamBody({
  sessionId,
  signal,
  startIndex,
}: {
  readonly sessionId: string;
  readonly signal?: AbortSignal;
  readonly startIndex: number;
}) {
  const path = `/eve/v1/session/${encodeURIComponent(sessionId)}/stream`;
  const query = startIndex > 0 ? `?${new URLSearchParams({ startIndex: String(startIndex) })}` : "";
  let status = 0;
  let body = "Failed to open message stream.";

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await fetch(`${path}${query}`, {
      signal: signal ?? null,
    });

    if (response.ok) {
      if (!response.body) {
        throw new Error("Response body is null.");
      }

      return response.body;
    }

    status = response.status;
    body = await response.text();

    if (!STREAM_OPEN_RETRYABLE_STATUS.has(response.status)) {
      throw new Error(formatResponseError(status, body));
    }

    if (attempt < 11) {
      await sleep(250);
    }
  }

  throw new Error(formatResponseError(status, body));
}

async function* readNdjsonStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        buffer += decoder.decode();
        break;
      }

      if (value) {
        buffer += decoder.decode(value, { stream: true });
      }

      let newlineIndex = buffer.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (line.length > 0) {
          yield JSON.parse(line) as HandleMessageStreamEvent;
        }

        newlineIndex = buffer.indexOf("\n");
      }
    }

    const line = buffer.trim();

    if (line.length > 0) {
      yield JSON.parse(line) as HandleMessageStreamEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

function advanceBrowserSession({
  baseStreamIndex,
  continuationToken,
  events,
  session,
  sessionId,
}: {
  readonly baseStreamIndex: number;
  readonly continuationToken?: string;
  readonly events: readonly HandleMessageStreamEvent[];
  readonly session: SessionState;
  readonly sessionId: string;
}) {
  const boundary = findBoundaryEvent(events);

  if (boundary?.type === "session.waiting" || boundary?.type === "turn.completed") {
    return {
      continuationToken: continuationToken ?? session.continuationToken,
      sessionId,
      streamIndex: baseStreamIndex + events.length,
    };
  }

  return createInitialSessionState();
}

function findBoundaryEvent(events: readonly HandleMessageStreamEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];

    if (event && isChatTurnSettledEvent(event)) {
      return event;
    }
  }
}

function reduceEventsToMessageData(
  events: readonly HandleMessageStreamEvent[],
): EveMessageData {
  const reducer = defaultMessageReducer();
  let data = reducer.initial();

  for (const event of events) {
    data = reducer.reduce(data, event);
  }

  return data;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

function isStreamDisconnectError(error: unknown) {
  if (isAbortError(error)) {
    return true;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const code =
    "code" in error && typeof error.code === "string" ? error.code : undefined;

  return (
    error.name === "AbortError" ||
    error.message === "terminated" ||
    code === "UND_ERR_SOCKET" ||
    /abort|cancel|disconnect|premature close|socket|terminated/i.test(error.message)
  );
}

async function readResponseError(response: Response) {
  return formatResponseError(response.status, await response.text());
}

function formatResponseError(status: number, body: string) {
  if (body.length > 0) {
    try {
      const parsed = JSON.parse(body) as { readonly error?: unknown };

      if (typeof parsed.error === "string") {
        return parsed.error;
      }
    } catch {}

    return body;
  }

  return `Server returned ${status}.`;
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function AgentChatSession({
  activeChat,
  chatId,
  emptyComposer,
  isLoadingChat = false,
  onPendingUserMessageSettled,
  onControllerChange,
  pendingUserMessage,
}: {
  readonly activeChat: ActiveChat | null;
  readonly chatId?: string | null;
  readonly emptyComposer?: ReactNode;
  readonly isLoadingChat?: boolean;
  readonly onPendingUserMessageSettled?: () => void;
  readonly onControllerChange: (
    controller: AgentChatController | null,
    status: AgentChatControllerStatus,
  ) => void;
  readonly pendingUserMessage?: string | null;
}) {
  const {
    activeChatId: shellActiveChatId,
    enabledConnections,
    requestSignIn,
    setActiveChatId: setShellActiveChatId,
    setupStatus,
    touchChat,
    updateChatTitle,
    viewer,
  } = useChatShell();
  const [activeChatId, setActiveChatId] = useState(activeChat?.id ?? chatId ?? null);
  const [currentTitle, setCurrentTitle] = useState(activeChat?.title ?? "New chat");
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const [resumedEvents, setResumedEvents] = useState<HandleMessageStreamEvent[]>([]);
  const [isResuming, setIsResuming] = useState(false);
  const [localEvents, setLocalEvents] = useState<HandleMessageStreamEvent[]>([]);
  const [skippingAuthorizationKey, setSkippingAuthorizationKey] = useState<string | null>(null);
  const activeChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const eventIndexRef = useRef(activeChat?.events.length ?? 0);
  const eventIndexChatIdRef = useRef(activeChat?.id ?? chatId ?? null);
  const firstMessageRef = useRef<string | null>(null);
  const currentTitleRef = useRef(activeChat?.title ?? "New chat");
  const resumeStartedRef = useRef(false);
  const resumedEventsRef = useRef<HandleMessageStreamEvent[]>([]);
  const localEventsRef = useRef<HandleMessageStreamEvent[]>([]);
  const onSessionStartedRef = useRef<(session: SessionState) => Promise<void> | void>(
    () => {},
  );
  const persistedSessionRef = useRef<ClientSession | null>(null);
  persistedSessionRef.current ??= createPersistedClientSession({
    initialSession: activeChat?.session,
    onSessionStarted: (session) => onSessionStartedRef.current(session),
  });
  const isSetupReady = setupStatus.authReady && setupStatus.databaseReady;
  const router = useRouter();

  const persistSnapshot = useCallback(
    async (snapshot: AgentSnapshot) => {
      const chatId = activeChatIdRef.current;

      if (!viewer || !chatId) {
        return;
      }

      setClientError(null);

      try {
        const events = mergeLocalEvents(snapshot.events, localEventsRef.current);

        await saveChatSnapshotAction({
          chatId,
          events,
          session: snapshot.session,
        });
        eventIndexRef.current = events.length;
        touchChat({
          id: chatId,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });

        const firstMessage =
          firstMessageRef.current ?? getFirstUserMessage(snapshot.data.messages);

        if (firstMessage && currentTitleRef.current === "New chat") {
          const titleResult = await generateChatTitleAction({
            chatId,
            firstMessage,
          });
          setCurrentTitle(titleResult.title);
          currentTitleRef.current = titleResult.title;
          updateChatTitle(chatId, titleResult.title);
        }
      } catch (error) {
        setClientError(error instanceof Error ? error.message : "Failed to save chat.");
      }
    },
    [touchChat, updateChatTitle, viewer],
  );

  const persistStreamEvent = useCallback(
    (event: HandleMessageStreamEvent) => {
      const chatId = activeChatIdRef.current;

      if (!viewer || !chatId) {
        return;
      }

      const eventIndex = eventIndexRef.current;
      eventIndexRef.current += 1;

      void appendChatEventAction({
        chatId,
        event,
        eventIndex,
      }).catch((error) => {
        setClientError(
          error instanceof Error ? error.message : "Failed to save stream progress.",
        );
      });
    },
    [viewer],
  );

  const persistSessionState = useCallback(
    async (session: SessionState) => {
      const chatId = activeChatIdRef.current;

      if (!viewer || !chatId || !session.sessionId) {
        return;
      }

      try {
        await saveChatSessionStateAction({
          chatId,
          session,
        });
      } catch (error) {
        setClientError(
          error instanceof Error ? error.message : "Failed to save session state.",
        );
      }
    },
    [viewer],
  );

  onSessionStartedRef.current = persistSessionState;

  const agent = useEveAgent({
    initialEvents: activeChat?.events ?? [],
    session: persistedSessionRef.current,
    onEvent: persistStreamEvent,
    onFinish: (snapshot) => {
      void persistSnapshot(snapshot);
    },
  });

  const hasResumeOverlay = isResuming || resumedEvents.length > 0;
  const resumedEventLog = useMemo(
    () => [...(activeChat?.events ?? []), ...resumedEvents],
    [activeChat?.events, resumedEvents],
  );
  const resumedData = useMemo(() => reduceEventsToMessageData(resumedEventLog), [resumedEventLog]);
  const baseDisplayEvents = hasResumeOverlay ? resumedEventLog : agent.events;
  const displayEvents = useMemo(
    () => mergeLocalEvents(baseDisplayEvents, localEvents),
    [baseDisplayEvents, localEvents],
  );
  const displayMessages = hasResumeOverlay ? resumedData.messages : agent.data.messages;
  const isBusy = isResuming || agent.status === "submitted" || agent.status === "streaming";
  const pendingMessage = pendingUserMessage
    ? createPendingUserMessage(chatId ?? activeChatId ?? "new", pendingUserMessage)
    : null;
  const pendingAuthorizations = getPendingAuthorizations(displayEvents);
  const isWaitingForAuthorization = pendingAuthorizations.length > 0;
  const disabledReason = isWaitingForAuthorization
    ? getConnectionAuthorizationDisabledReason(pendingAuthorizations)
    : undefined;
  const visibleMessages =
    pendingMessage && !hasLatestUserMessage(displayMessages, pendingUserMessage ?? "")
      ? [...displayMessages, pendingMessage]
      : displayMessages;
  const isEmpty = visibleMessages.length === 0 && !isBusy && !isWaitingForAuthorization;
  const isChatRoute = Boolean(shellActiveChatId || chatId);
  const showThinking = !isWaitingForAuthorization && (Boolean(pendingMessage) || isBusy);
  const thinkingPresence = useThinkingPresence(showThinking);
  const displayError = clientError ?? agent.error?.message ?? null;
  const toastError = displayError && dismissedError !== displayError ? displayError : null;

  const resetSession = useCallback(() => {
    agent.reset();
    setActiveChatId(null);
    activeChatIdRef.current = null;
    eventIndexRef.current = 0;
    eventIndexChatIdRef.current = null;
    setCurrentTitle("New chat");
    currentTitleRef.current = "New chat";
    firstMessageRef.current = null;
    resumeStartedRef.current = false;
    resumedEventsRef.current = [];
    localEventsRef.current = [];
    setResumedEvents([]);
    setLocalEvents([]);
    setIsResuming(false);
    setClientError(null);
  }, [agent]);

  const prepareSend = useCallback(
    async (firstMessage: string) => {
      setClientError(null);

      if (!isSetupReady) {
        setClientError("Finish the required Neon and Better Auth setup before chatting.");
        return false;
      }

      if (!viewer) {
        requestSignIn(firstMessage);
        return false;
      }

      const limit = await checkSendLimitAction();

      if (!limit.allowed) {
        setClientError(`${limit.message} Retry in ${limit.retryAfter}s.`);
        return false;
      }

      if (!activeChatIdRef.current) {
        const created = await createChatAction();

        touchChat(created);
        setActiveChatId(created.id);
        setShellActiveChatId(created.id);
        activeChatIdRef.current = created.id;
        eventIndexChatIdRef.current = created.id;
        eventIndexRef.current = 0;
        setCurrentTitle(created.title);
        currentTitleRef.current = created.title;
        router.replace(`/chat/${created.id}`, { scroll: false });
      }

      firstMessageRef.current ??= firstMessage;

      return true;
    },
    [isSetupReady, requestSignIn, router, setShellActiveChatId, touchChat, viewer],
  );

  const sendMessage = useCallback(
    async (text: string, draftHandlers: DraftHandlers) => {
      const message = text.trim();

      if (!message || isBusy) {
        return;
      }

      if (isWaitingForAuthorization) {
        draftHandlers.restoreDraft(message);
        setClientError(disabledReason ?? "Connect the requested service before continuing.");
        return;
      }

      let ready = false;

      try {
        ready = await prepareSend(message);
      } catch (error) {
        draftHandlers.restoreDraft(message);
        setClientError(error instanceof Error ? error.message : "Failed to prepare chat.");
        return;
      }

      if (!ready) {
        const chatId = activeChatIdRef.current;

        if (chatId) {
          void clearChatPendingMessageAction(chatId);
        }
        draftHandlers.restoreDraft(message);
        return;
      }

      const chatId = activeChatIdRef.current;

      if (!chatId) {
        draftHandlers.restoreDraft(message);
        setClientError("Chat is still getting ready.");
        return;
      }

      try {
        const updated = await markChatPendingMessageAction({
          chatId,
          message,
        });
        touchChat(updated);
      } catch (error) {
        draftHandlers.restoreDraft(message);
        setClientError(error instanceof Error ? error.message : "Failed to save pending message.");
        return;
      }

      draftHandlers.clearDraft();

      try {
        await agent.send({
          clientContext: createConnectionClientContext(enabledConnections),
          message,
        });
      } catch (error) {
        void clearChatPendingMessageAction(chatId);
        draftHandlers.restoreDraft(message);
        setClientError(error instanceof Error ? error.message : "Failed to send message.");
      }
    },
    [
      agent,
      disabledReason,
      enabledConnections,
      isBusy,
      isWaitingForAuthorization,
      prepareSend,
      touchChat,
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
      if (isBusy) {
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

      const limit = await checkSendLimitAction();

      if (!limit.allowed) {
        setClientError(`${limit.message} Retry in ${limit.retryAfter}s.`);
        return;
      }

      try {
        await agent.send({ inputResponses: responses });
      } catch (error) {
        setClientError(error instanceof Error ? error.message : "Failed to send response.");
      }
    },
    [agent, isBusy, requestSignIn, viewer],
  );

  const handleSkipAuthorization = useCallback(
    async (authorization: PendingConnectionAuthorization) => {
      const chatId = activeChatIdRef.current;

      if (!viewer) {
        requestSignIn();
        return;
      }

      if (!chatId) {
        setClientError("Start a chat before skipping authorization.");
        return;
      }

      const event = createAuthorizationDeclinedEvent(authorization);
      const nextLocalEvents = mergeLocalEvents(localEventsRef.current, [event]);

      localEventsRef.current = nextLocalEvents;
      setLocalEvents(nextLocalEvents);
      setSkippingAuthorizationKey(authorization.key);
      setClientError(null);

      try {
        const result = await skipChatAuthorizationAction({
          chatId,
          event,
        });

        eventIndexRef.current = Math.max(eventIndexRef.current, result.eventIndex + 1);
        touchChat(result.chat);
        onPendingUserMessageSettled?.();
      } catch (error) {
        const eventKey = getLocalEventKey(event);
        const revertedEvents = localEventsRef.current.filter(
          (localEvent) => getLocalEventKey(localEvent) !== eventKey,
        );

        localEventsRef.current = revertedEvents;
        setLocalEvents(revertedEvents);
        setClientError(
          error instanceof Error ? error.message : "Failed to skip authorization.",
        );
      } finally {
        setSkippingAuthorizationKey(null);
      }
    },
    [onPendingUserMessageSettled, requestSignIn, touchChat, viewer],
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
    if (eventIndexChatIdRef.current !== nextChatId) {
      eventIndexChatIdRef.current = nextChatId;
      eventIndexRef.current = nextEventIndex;
      localEventsRef.current = [];
      setLocalEvents([]);
    } else if (!isBusy) {
      eventIndexRef.current = Math.max(eventIndexRef.current, nextEventIndex);
    }
    setCurrentTitle(nextTitle);
    currentTitleRef.current = nextTitle;
  }, [activeChat?.events.length, activeChat?.id, activeChat?.title, chatId, isBusy]);

  useEffect(() => {
    if (
      !viewer ||
      !pendingUserMessage ||
      !activeChat?.session?.sessionId ||
      resumeStartedRef.current ||
      agent.status !== "ready"
    ) {
      return;
    }

    const abortController = new AbortController();
    const existingEvents = activeChat.events;
    const startIndex = existingEvents.length;
    const session = createPersistedClientSession({
      initialSession: activeChat.session,
      onSessionStarted: persistSessionState,
    });
    let cancelled = false;

    resumeStartedRef.current = true;
    resumedEventsRef.current = [];
    setResumedEvents([]);
    setIsResuming(true);
    setClientError(null);

    void (async () => {
      try {
        for await (const event of session.stream({
          signal: abortController.signal,
          startIndex,
        })) {
          if (cancelled) {
            return;
          }

          const nextEvents = [...resumedEventsRef.current, event];
          resumedEventsRef.current = nextEvents;
          setResumedEvents(nextEvents);

          await appendChatEventAction({
            chatId: activeChat.id,
            event,
            eventIndex: startIndex + nextEvents.length - 1,
          });

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

        const data = reduceEventsToMessageData(allEvents);

        await saveChatSnapshotAction({
          chatId: activeChat.id,
          events: allEvents,
          session: session.state,
        });
        eventIndexRef.current = allEvents.length;
        touchChat({
          id: activeChat.id,
          title: currentTitleRef.current,
          updatedAt: new Date().toISOString(),
        });

        const firstMessage =
          firstMessageRef.current ?? getFirstUserMessage(data.messages);

        if (firstMessage && currentTitleRef.current === "New chat") {
          const titleResult = await generateChatTitleAction({
            chatId: activeChat.id,
            firstMessage,
          });
          setCurrentTitle(titleResult.title);
          currentTitleRef.current = titleResult.title;
          updateChatTitle(activeChat.id, titleResult.title);
        }

        onPendingUserMessageSettled?.();
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
      abortController.abort();
    };
  }, [
    activeChat?.events,
    activeChat?.id,
    activeChat?.session,
    agent.status,
    onPendingUserMessageSettled,
    pendingUserMessage,
    persistSessionState,
    touchChat,
    updateChatTitle,
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
      pendingUserMessage &&
      agent.data.messages.length > 0 &&
      agent.status !== "ready"
    ) {
      onPendingUserMessageSettled?.();
    }
  }, [
    agent.data.messages.length,
    agent.status,
    onPendingUserMessageSettled,
    pendingUserMessage,
  ]);

  useEffect(() => {
    onControllerChange(
      {
        reset: resetSession,
        sendMessage,
        stop: agent.stop,
      },
      {
        disabledReason,
        isBusy,
        isDisabled: !isSetupReady || isWaitingForAuthorization,
        isEmpty,
      },
    );
  }, [
    agent.stop,
    disabledReason,
    isBusy,
    isEmpty,
    isSetupReady,
    isWaitingForAuthorization,
    onControllerChange,
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
            <SessionHeader isLoading={isLoadingChat} title={currentTitle} />
          ) : null}
          {isEmpty ? (
            <BlankChatBody />
          ) : (
            <ChatConversation>
              <ChatConversationContent>
                {visibleMessages.map((message, index) => (
                  <AgentMessage
                    canRespond={
                      !isBusy &&
                      !isWaitingForAuthorization &&
                      Boolean(viewer) &&
                      isSetupReady
                    }
                    isStreaming={
                      agent.status === "streaming" && index === visibleMessages.length - 1
                    }
                    key={message.id}
                    message={message}
                    onInputResponses={handleInputResponses}
                  />
                ))}
                {pendingAuthorizations.map((authorization) => (
                  <ConnectionAuthorizationPrompt
                    authorization={authorization}
                    isSkipping={skippingAuthorizationKey === authorization.key}
                    key={authorization.key}
                    onSkip={handleSkipAuthorization}
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

type PendingConnectionAuthorization = {
  readonly description: string;
  readonly displayName: string;
  readonly expiresAt?: string;
  readonly instructions?: string;
  readonly key: string;
  readonly name: string;
  readonly sequence: number;
  readonly stepIndex: number;
  readonly turnId: string;
  readonly url?: string;
  readonly authorization?: AuthorizationRequiredStreamEvent["data"]["authorization"];
};

function getPendingAuthorizations(events: readonly HandleMessageStreamEvent[]) {
  const pending = new Map<string, PendingConnectionAuthorization>();

  for (const event of events) {
    if (event.type === "authorization.required") {
      const authorization = toPendingAuthorization(event);
      pending.set(authorization.name, authorization);
      continue;
    }

    if (event.type === "authorization.completed") {
      pending.delete(event.data.name);
    }
  }

  return [...pending.values()];
}

function getConnectionAuthorizationDisabledReason(
  authorizations: readonly PendingConnectionAuthorization[],
) {
  const displayName = authorizations[0]?.displayName ?? "the requested service";

  return `Connect ${displayName} to continue this turn, or skip it.`;
}

function toPendingAuthorization(
  event: AuthorizationRequiredStreamEvent,
): PendingConnectionAuthorization {
  const challenge = event.data.authorization;
  const displayName = challenge?.displayName ?? event.data.name;

  return {
    authorization: challenge,
    description:
      challenge?.instructions ??
      event.data.description ??
      `Connect ${displayName} to let Eve continue.`,
    displayName,
    expiresAt: challenge?.expiresAt,
    instructions: challenge?.instructions,
    key: `${event.data.turnId}:${event.data.name}`,
    name: event.data.name,
    sequence: event.data.sequence,
    stepIndex: event.data.stepIndex,
    turnId: event.data.turnId,
    url: challenge?.url,
  };
}

function ConnectionAuthorizationPrompt({
  authorization,
  isSkipping,
  onSkip,
}: {
  readonly authorization: PendingConnectionAuthorization;
  readonly isSkipping: boolean;
  readonly onSkip: (authorization: PendingConnectionAuthorization) => Promise<void>;
}) {
  return (
    <article aria-live="polite" className="flex w-full justify-start">
      <div className="w-full max-w-md rounded-lg border border-border/70 bg-muted/20 p-3 text-sm shadow-sm">
        <div className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <PlugIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Connect {authorization.displayName}</p>
            <p className="mt-1 text-muted-foreground">
              {authorization.description}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              {authorization.url ? (
                <Button asChild size="xs" type="button">
                  <a
                    href={authorization.url}
                    rel="noreferrer"
                    target="_blank"
                  >
                    Connect
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </Button>
              ) : null}
              <Button
                disabled={isSkipping}
                onClick={() => {
                  void onSkip(authorization);
                }}
                size="xs"
                type="button"
                variant="outline"
              >
                {isSkipping ? "Skipping..." : "Skip"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function createAuthorizationDeclinedEvent(
  authorization: PendingConnectionAuthorization,
): AuthorizationCompletedStreamEvent {
  return {
    data: {
      authorization: authorization.authorization,
      name: authorization.name,
      outcome: "declined",
      reason: "skipped",
      sequence: authorization.sequence,
      stepIndex: authorization.stepIndex,
      turnId: authorization.turnId,
    },
    type: "authorization.completed",
  };
}

function mergeLocalEvents(
  events: readonly HandleMessageStreamEvent[],
  localEvents: readonly HandleMessageStreamEvent[],
): HandleMessageStreamEvent[] {
  const merged = [...events];

  if (localEvents.length === 0) {
    return merged;
  }

  const keys = new Set(events.map(getLocalEventKey).filter(Boolean));

  for (const event of localEvents) {
    const key = getLocalEventKey(event);

    if (!key || keys.has(key)) {
      continue;
    }

    keys.add(key);
    merged.push(event);
  }

  return merged;
}

function getLocalEventKey(event: HandleMessageStreamEvent) {
  if (event.type === "authorization.completed") {
    return `${event.type}:${event.data.turnId}:${event.data.name}:${event.data.outcome}:${event.data.reason ?? ""}`;
  }

  return null;
}

function createPendingUserMessage(chatId: string, text: string): EveMessage {
  return {
    id: `${chatId}:pending-user-message`,
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

function createConnectionClientContext(enabledConnections: EnabledConnections) {
  if (enabledConnections.notion) {
    return "The user has enabled the Notion connection for this turn. Use the Notion connection when it is relevant to the user's request.";
  }

  return "The user has disabled all external connections for this turn. Do not search or call connection tools unless the user enables a connection first.";
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
      <div className="text-sm font-medium leading-relaxed text-muted-foreground">
        <span className="shimmer-text">Thinking...</span>
      </div>
    </article>
  );
}

function SessionHeader({
  isLoading,
  title,
}: {
  readonly isLoading: boolean;
  readonly title: string;
}) {
  return (
    <div className="shrink-0 border-b border-border/70 py-3 pr-16 pl-12 md:pr-28 md:pl-4">
      {isLoading ? (
        <div
          aria-label="Loading chat title"
          className="h-5 w-48 max-w-[50vw] animate-pulse rounded-md bg-muted/25"
          data-chat-title-skeleton
        />
      ) : (
        <h1 className="truncate text-base font-medium tracking-tight">{title}</h1>
      )}
    </div>
  );
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
              alt="Eve"
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
  const { enabledConnections, setConnectionEnabled } = useChatShell();

  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
      <ComposerHint setupStatus={setupStatus} />
      <IntegrationsMenu
        notionEnabled={enabledConnections.notion}
        onNotionEnabledChange={(enabled) => setConnectionEnabled("notion", enabled)}
        setupStatus={setupStatus}
      />
    </div>
  );
}

function ComposerHint({ setupStatus }: { readonly setupStatus: SetupStatus }) {
  if (!setupStatus.authReady || !setupStatus.databaseReady) {
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
  if (!setupStatus.databaseReady) {
    return "Connect Neon Postgres before chatting.";
  }

  if (!setupStatus.authReady) {
    return setupStatus.missing.length
      ? `Finish auth setup. Missing: ${setupStatus.missing.join(", ")}.`
      : "Finish auth setup before chatting.";
  }

  return "Finish setup before chatting.";
}

function getFirstUserMessage(messages: readonly EveMessageData["messages"][number][]) {
  const message = messages.find((item) => item.role === "user");

  if (!message) {
    return null;
  }

  return getMessageText(message);
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
