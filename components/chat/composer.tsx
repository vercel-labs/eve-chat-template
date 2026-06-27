"use client";

import { ArrowUpIcon, Loader2Icon, PaperclipIcon, SquareIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { AttachmentList, type PendingAttachment } from "@/components/chat/attachments";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { MAX_ATTACHMENTS, validateAttachmentFile } from "@/lib/attachments";
import { getChatMessageLength, MAX_CHAT_MESSAGE_CHARS } from "@/lib/chat/limits";
import { cn } from "@/lib/utils";

export type ComposerSubmitValue = {
  readonly attachments: readonly PendingAttachment[];
  readonly text: string;
};

export function ChatComposer({
  attachments = [],
  autoFocus = true,
  className,
  disabled = false,
  disabledReason,
  footerStart,
  isBusy = false,
  isPreparing = false,
  maxLength = MAX_CHAT_MESSAGE_CHARS,
  onAttachmentsChange,
  onChange,
  onSubmit,
  placeholder = "Ask eve anything...",
  value,
}: {
  readonly attachments?: readonly PendingAttachment[];
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly footerStart?: ReactNode;
  readonly isBusy?: boolean;
  readonly isPreparing?: boolean;
  readonly maxLength?: number;
  readonly onAttachmentsChange?: (attachments: readonly PendingAttachment[]) => void;
  readonly onChange: (value: string) => void;
  readonly onStop: () => void;
  readonly onSubmit: (value: ComposerSubmitValue) => void | Promise<void>;
  readonly placeholder?: string;
  readonly value: string;
}) {
  const composerId = useId();
  const fileInputId = `${composerId}-file`;
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaDisabled = disabled || isBusy || isPreparing;
  const trimmedValue = value.trim();
  const isOverMaxLength = getChatMessageLength(trimmedValue) > maxLength;
  const canSubmit =
    (!!trimmedValue || attachments.length > 0) &&
    !disabled &&
    !isBusy &&
    !isPreparing &&
    !isOverMaxLength;

  useEffect(() => {
    if (!autoFocus || textareaDisabled) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, textareaDisabled]);

  const addAttachments = useCallback(
    (files: FileList | null) => {
      if (!files || !onAttachmentsChange) {
        return;
      }

      const incoming: PendingAttachment[] = [];
      let error: string | null = null;

      for (const file of Array.from(files)) {
        const validationError = validateAttachmentFile(file);

        if (validationError) {
          error = validationError;
          break;
        }

        if (attachments.length + incoming.length >= MAX_ATTACHMENTS) {
          error = `You can attach up to ${MAX_ATTACHMENTS} files.`;
          break;
        }

        incoming.push({
          file,
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          type: "local",
        });
      }

      if (error) {
        // Surface errors through a simple alert for now; callers can wire a toast later.
        window.alert(error);
        return;
      }

      onAttachmentsChange([...attachments, ...incoming]);
    },
    [attachments, onAttachmentsChange],
  );

  const removeAttachment = useCallback(
    (id: string) => {
      onAttachmentsChange?.(attachments.filter((attachment) => attachment.id !== id));
    },
    [attachments, onAttachmentsChange],
  );

  const submitValue = useCallback(() => {
    const text = value.trim();

    if (!canSubmit) {
      return;
    }

    void onSubmit({ attachments, text });
  }, [attachments, canSubmit, onSubmit, value]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitValue();
    },
    [submitValue],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitValue();
      }
    },
    [submitValue],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const files = event.clipboardData?.files;

      if (files && files.length > 0) {
        event.preventDefault();
        addAttachments(files);
      }
    },
    [addAttachments],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLFormElement>) => {
      event.preventDefault();
      addAttachments(event.dataTransfer.files);
    },
    [addAttachments],
  );

  const handleDragOver = useCallback((event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
  }, []);

  const form = (
    <form
      className={cn(
        "min-w-0 rounded-[14px] border border-border/80 bg-card/95 shadow-sm transition-colors focus-within:border-border focus-within:ring-[1px] focus-within:ring-foreground/5 dark:bg-muted/45 dark:focus-within:ring-white/5",
        className,
      )}
      data-chat-composer
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onSubmit={handleSubmit}
    >
      <AttachmentList attachments={attachments} onRemove={onAttachmentsChange ? removeAttachment : undefined} />
      <label className="sr-only" htmlFor={composerId}>
        Message eve
      </label>
      <textarea
        autoFocus={autoFocus}
        className="max-h-32 min-h-12 w-full resize-none bg-transparent px-3 pt-3 pb-1 text-base leading-6 outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 md:text-[15px] dark:placeholder:text-muted-foreground/60"
        data-chat-composer-input
        disabled={textareaDisabled}
        id={composerId}
        maxLength={maxLength}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        ref={textareaRef}
        rows={2}
        value={value}
      />
      <div className="flex min-h-9 items-center justify-between gap-2 px-3 pt-1 pb-2 sm:gap-3 sm:px-4">
        <div className="-ml-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          {onAttachmentsChange ? (
            <>
              <input
                accept="*/*"
                className="hidden"
                id={fileInputId}
                multiple
                onChange={(event) => addAttachments(event.target.files)}
                ref={fileInputRef}
                type="file"
              />
              <label
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:text-foreground focus-visible:outline-none dark:text-muted-foreground/60"
                htmlFor={fileInputId}
              >
                <PaperclipIcon className="size-4" />
              </label>
            </>
          ) : null}
          {footerStart ?? <span className="block h-8" />}
        </div>
        <div className="flex shrink-0 items-center">
          {isBusy ? (
            <Button
              aria-label="Response in progress"
              className="size-6 cursor-default rounded-md bg-foreground/15 text-foreground/55 shadow-none hover:bg-foreground/15 disabled:cursor-default disabled:pointer-events-auto disabled:opacity-100"
              disabled
              size="icon-xs"
              type="button"
            >
              <SquareIcon className="size-2.5 fill-current" />
            </Button>
          ) : isPreparing ? (
            <Button
              aria-label="Preparing chat"
              className="size-6 rounded-md bg-foreground/75 text-background"
              disabled
              size="icon-xs"
              type="button"
            >
              <Loader2Icon className="size-3 animate-spin" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-6 cursor-pointer rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:pointer-events-auto disabled:opacity-30"
              disabled={!canSubmit}
              size="icon-xs"
              type="submit"
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );

  if (!disabledReason || (!disabled && !isBusy && !isPreparing)) {
    return form;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div aria-label={disabledReason} className="min-w-0" tabIndex={0}>
          {form}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
