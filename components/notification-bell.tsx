"use client";

import { BellIcon, CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  getNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/app/actions/notifications";
import type { Notification } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const items = await getNotificationsAction();
      if (!cancelled) setNotifications(items);
    };

    void load();

    const interval = window.setInterval(() => {
      void load();
    }, 30000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const handleMarkRead = async (id: string) => {
    await markNotificationReadAction(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsReadAction();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          type="button"
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72" sideOffset={8}>
        {notifications.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">No notifications</div>
        ) : (
          <>
            {unreadCount > 0 ? (
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:bg-muted"
                onClick={() => void handleMarkAllRead()}
                type="button"
              >
                <CheckIcon className="size-3" />
                Mark all as read
              </button>
            ) : null}
            {notifications.map((n) => (
              <DropdownMenuItem
                className={cn("flex flex-col items-start px-3 py-2", !n.read && "bg-muted/50")}
                key={n.id}
                onClick={() => void handleMarkRead(n.id)}
              >
                <span className="text-sm font-medium">{n.title}</span>
                {n.body ? <span className="text-xs text-muted-foreground">{n.body}</span> : null}
                {n.source ? <span className="text-[10px] text-muted-foreground">{n.source}</span> : null}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
