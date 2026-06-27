"use server";

import { db } from "@/lib/db/client";
import { memory } from "@/lib/db/schema";
import { eq, count } from "drizzle-orm";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function getMemoryCountAction(): Promise<number> {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return 0;
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return 0;
  }

  const [row] = await db
    .select({ value: count() })
    .from(memory)
    .where(eq(memory.userId, viewer.id));

  return row?.value ?? 0;
}
