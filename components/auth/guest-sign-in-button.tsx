"use client";

import { Loader2Icon, UserIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

export function GuestSignInButton({
  className,
  disabled,
  onBeforeSignIn,
  variant = "outline",
}: {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onBeforeSignIn?: () => void;
  readonly variant?: React.ComponentProps<typeof Button>["variant"];
}) {
  const [pending, setPending] = useState(false);

  return (
    <Button
      aria-busy={pending}
      className={cn("gap-2", className)}
      disabled={disabled || pending}
      onClick={async () => {
        setPending(true);

        try {
          onBeforeSignIn?.();

          const result = await authClient.signIn.anonymous();

          if (result?.error) {
            setPending(false);
          }
        } catch {
          setPending(false);
        }
      }}
      type="button"
      variant={variant}
    >
      {pending ? (
        <Loader2Icon className="size-3.5 animate-spin" />
      ) : (
        <UserIcon className="size-3.5" />
      )}
      {pending ? "Joining..." : "Continue as guest"}
    </Button>
  );
}
