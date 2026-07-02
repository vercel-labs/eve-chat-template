"use server";

import { listAuditLogForUser } from "@/lib/db/audit";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function getAuditLogAction() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return [];
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return [];
  }

  return listAuditLogForUser(viewer.id, 20);
}
