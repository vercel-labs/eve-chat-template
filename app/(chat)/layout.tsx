import { Suspense, type ReactNode } from "react";
import { AgentChatBootstrapSync } from "@/app/_components/agent-chat-bootstrap-sync";
import { AgentChatShell } from "@/app/_components/agent-chat-shell";
import type { SetupStatus } from "@/lib/chat/types";
import { listChatsPageByUser } from "@/lib/db/queries";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export default function ChatLayout({ children }: { readonly children: ReactNode }) {
  const setupStatus = getSetupStatus();

  return (
    <AgentChatShell
      initialChats={[]}
      initialNextCursor={null}
      setupStatus={setupStatus}
      viewer={null}
    >
      {children}
      <div className="hidden" aria-hidden>
        <Suspense fallback={null}>
          <ResolvedChatBootstrap setupStatus={setupStatus} />
        </Suspense>
      </div>
    </AgentChatShell>
  );
}

async function ResolvedChatBootstrap({
  setupStatus,
}: {
  readonly setupStatus: SetupStatus;
}) {
  const viewer = await getServerViewer();
  const appReady = setupStatus.authReady && setupStatus.databaseReady;
  const initialChatsPage =
    viewer && appReady
      ? await listChatsPageByUser(viewer.id)
      : { items: [], nextCursor: null };

  return (
    <AgentChatBootstrapSync
      chats={initialChatsPage.items}
      nextCursor={initialChatsPage.nextCursor}
      viewer={viewer}
    />
  );
}
