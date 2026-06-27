"use server";

import { listTasksForUser } from "@/lib/db/tasks";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function getTasksAction() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return [];
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return [];
  }

  return listTasksForUser(viewer.id);
}
