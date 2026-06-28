import { Suspense } from "react";
import { WelcomeContent } from "./welcome-content";

export default function WelcomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <a className="flex items-center gap-2 text-lg font-semibold" href="/">
          <img alt="eve" className="size-6 invert dark:invert-0" src="/eve.svg" />
          eve Agent
        </a>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h1 className="mb-4 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Build your own autonomous agent
        </h1>
        <p className="mb-8 max-w-xl text-lg text-muted-foreground">
          A durable, chat-first agent with memory, knowledge base, tasks, subagents, schedules,
          notifications, and external webhooks.
        </p>

        <Suspense
          fallback={
            <div className="flex flex-col items-center gap-3 sm:flex-row">
              <div className="h-11 w-48 rounded-md bg-muted" />
              <div className="h-11 w-48 rounded-md bg-muted" />
            </div>
          }
        >
          <WelcomeContent />
        </Suspense>
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
