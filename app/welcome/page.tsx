import { SignInButton } from "@/components/auth/sign-in-button";
import { GuestSignInButton } from "@/components/auth/guest-sign-in-button";
import { getSetupStatus } from "@/lib/setup";
import Link from "next/link";

export default async function WelcomePage() {
  const setupStatus = await getSetupStatus();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link className="flex items-center gap-2 text-lg font-semibold" href="/">
          <img alt="eve" className="size-6 invert dark:invert-0" src="/eve.svg" />
          eve Agent
        </Link>
        <nav className="flex items-center gap-4">
          <Link className="text-sm text-muted-foreground hover:text-foreground" href="/dashboard">
            Dashboard
          </Link>
        </nav>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Build your own autonomous agent
        </h1>
        <p className="mb-8 max-w-xl text-lg text-muted-foreground">
          A durable, chat-first agent with memory, knowledge base, tasks, subagents, schedules,
          notifications, and external webhooks.
        </p>

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
      </main>

      <footer className="px-6 py-4 text-center text-sm text-muted-foreground">
        Built with{" "}
        <a className="underline" href="https://eve.dev" rel="noreferrer" target="_blank">
          eve
        </a>
        .
      </footer>
    </div>
  );
}
