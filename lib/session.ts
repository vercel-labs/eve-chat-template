import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { Viewer } from "@/lib/chat/types";
import { isAppConfigured } from "@/lib/setup";

export async function getServerViewer(): Promise<Viewer | null> {
  if (!isAppConfigured()) {
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
      name: session.user.name,
    };
  } catch {
    return null;
  }
}
