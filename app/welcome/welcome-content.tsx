import { SignInButton } from "@/components/auth/sign-in-button";
import { GuestSignInButton } from "@/components/auth/guest-sign-in-button";
import { getSetupStatus } from "@/lib/setup";
import Link from "next/link";

export async function WelcomeContent() {
  const setupStatus = await getSetupStatus();

  return (
    <>
      <nav className="absolute right-6 top-4 flex items-center gap-4">
        <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">
          Dashboard
        </Link>
      </nav>

      {setupStatus.appReady ? (
        <div className="flex flex-col items-center gap-3 sm:flex-row">
          <SignInButton className="h-11 px-6">Sign in with Vercel</SignInButton>
          <GuestSignInButton className="h-11 px-6" />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          App is still being configured. Check your environment variables.
        </p>
      )}
    </>
  );
}
