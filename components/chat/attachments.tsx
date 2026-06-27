"use client";

import { FileIcon, XIcon } from "lucide-react";
import { formatFileSize } from "@/lib/attachments";
import { cn } from "@/lib/utils";

export type LocalAttachment = {
  readonly file: File;
  readonly id: string;
  readonly type: "local";
};

export type UploadedAttachment = {
  readonly filename: string;
  readonly id: string;
  readonly mediaType: string;
  readonly type: "uploaded";
  readonly url: string;
};

export type PendingAttachment = LocalAttachment | UploadedAttachment;

export function AttachmentChip({
  className,
  filename,
  onRemove,
  size,
}: {
  readonly className?: string;
  readonly filename: string;
  readonly onRemove?: () => void;
  readonly size?: number;
}) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-foreground",
        className,
      )}
    >
      <FileIcon className="size-3.5 shrink-0" />
      <span className="min-w-0 truncate">{filename}</span>
      {size !== undefined ? (
        <span className="shrink-0 text-muted-foreground">{formatFileSize(size)}</span>
      ) : null}
      {onRemove ? (
        <button
          aria-label={`Remove ${filename}`}
          className="ml-1 shrink-0 rounded-sm p-0.5 hover:bg-muted"
          onClick={onRemove}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

function getAttachmentLabel(attachment: PendingAttachment) {
  return attachment.type === "local" ? attachment.file.name : attachment.filename;
}

function getAttachmentSize(attachment: PendingAttachment) {
  return attachment.type === "local" ? attachment.file.size : undefined;
}

export function AttachmentList({
  attachments,
  onRemove,
}: {
  readonly attachments: readonly PendingAttachment[];
  readonly onRemove?: (id: string) => void;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2 px-3 pt-2 sm:px-4">
      {attachments.map((attachment) => (
        <AttachmentChip
          filename={getAttachmentLabel(attachment)}
          key={attachment.id}
          onRemove={onRemove ? () => onRemove(attachment.id) : undefined}
          size={getAttachmentSize(attachment)}
        />
      ))}
    </div>
  );
}

export function UploadedAttachmentList({
  attachments,
  className,
}: {
  readonly attachments: readonly { readonly filename: string; readonly id: string; readonly size: number; readonly url: string }[];
  readonly className?: string;
}) {
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {attachments.map((attachment) => (
        <a
          className="inline-flex max-w-full items-center gap-2 rounded-md border border-border bg-muted/60 px-2 py-1 text-xs text-foreground hover:bg-muted"
          href={attachment.url}
          key={attachment.id}
          rel="noopener noreferrer"
          target="_blank"
        >
          <FileIcon className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate">{attachment.filename}</span>
          <span className="shrink-0 text-muted-foreground">{formatFileSize(attachment.size)}</span>
        </a>
      ))}
    </div>
  );
}
