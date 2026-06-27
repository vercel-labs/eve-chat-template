"use server";

import { listNotificationsForUser, markAllNotificationsRead, markNotificationRead } from "@/lib/db/notifications";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";

export async function getNotificationsAction(unreadOnly = false) {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return [];
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return [];
  }

  return listNotificationsForUser(viewer.id, unreadOnly);
}

export async function markNotificationReadAction(notificationId: string) {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return { ok: false };
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return { ok: false };
  }

  await markNotificationRead(viewer.id, notificationId);
  return { ok: true };
}

export async function markAllNotificationsReadAction() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return { ok: false };
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return { ok: false };
  }

  await markAllNotificationsRead(viewer.id);
  return { ok: true };
}
