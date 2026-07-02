import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { SetupStatus, Viewer } from "@/lib/chat/types";
import { getSetupStatus } from "@/lib/setup";

export async function getServerViewer(setupStatus?: SetupStatus): Promise<Viewer | null> {
  const status = setupStatus ?? (await getSetupStatus());

  if (!status.appReady) {
    return null;
  }

  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return null;
    }

    return {
      email: session.user.email,
      id: session.user.id,
      image: session.user.image ?? null,
      isAnonymous: (session.user as { isAnonymous?: boolean }).isAnonymous ?? false,
      name: session.user.name,
    };
  } catch {
    return null;
  }
}
