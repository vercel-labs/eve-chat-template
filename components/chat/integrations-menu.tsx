"use client";

import { HammerIcon } from "lucide-react";
import { NotionIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { SetupStatus } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export function IntegrationsMenu({
  notionEnabled,
  onNotionEnabledChange,
  setupStatus,
}: {
  readonly notionEnabled: boolean;
  readonly onNotionEnabledChange: (enabled: boolean) => void;
  readonly setupStatus: SetupStatus;
}) {
  const setupReady = setupStatus.authReady && setupStatus.databaseReady;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Connections"
          className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:bg-muted/60 focus-visible:text-foreground focus-visible:outline-none dark:text-muted-foreground/60"
          type="button"
        >
          {notionEnabled ? (
            <NotionIcon className="size-[18px] shrink-0" />
          ) : (
            <HammerIcon className="size-4 shrink-0" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52 rounded-md border-border bg-popover p-1"
        sideOffset={4}
      >
        <DropdownMenuItem
          aria-checked={notionEnabled}
          className="h-11 cursor-pointer gap-3 rounded-sm px-2 py-1.5 text-sm focus:bg-muted/70"
          disabled={!setupReady}
          onSelect={(event) => {
            event.preventDefault();

            if (setupReady) {
              onNotionEnabledChange(!notionEnabled);
            }
          }}
          role="menuitemcheckbox"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <NotionIcon className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] text-foreground">Notion</span>
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
              notionEnabled ? "bg-emerald-500" : "bg-muted",
            )}
          >
            <span
              className={cn(
                "size-4 rounded-full bg-white shadow-sm transition-transform",
                notionEnabled ? "translate-x-[18px]" : "translate-x-0.5",
              )}
            />
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
