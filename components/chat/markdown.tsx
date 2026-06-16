"use client";

import { cjk } from "@streamdown/cjk";
import { code } from "@streamdown/code";
import { math } from "@streamdown/math";
import { mermaid } from "@streamdown/mermaid";
import { memo, type ComponentProps } from "react";
import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";

const streamdownPlugins = { cjk, code, math, mermaid };

export type MarkdownProps = ComponentProps<typeof Streamdown>;

export const Markdown = memo(function Markdown({ className, ...props }: MarkdownProps) {
  return (
    <Streamdown
      className={cn(
        "min-w-0 text-sm leading-6 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      plugins={streamdownPlugins}
      {...props}
    />
  );
});
