import type { LabProvider, EffectIntent, EffectDispatchResult } from "./types";
import { createNotification } from "@/lib/db/notifications";
import { createTask } from "@/lib/db/tasks";
import { logToolCall } from "@/lib/db/audit";

export const localLab: LabProvider = {
  id: "local",
  async admit(intent: EffectIntent): Promise<EffectDispatchResult> {
    if (!intent.userId) {
      return { dispatched: false, provider: "local", reason: "no authenticated approver" };
    }
    // Gate irreversibles: the local Lab refuses what it cannot compensate.
    if (intent.effect_class === "irreversible") {
      return { dispatched: false, provider: "local",
        reason: "local Lab does not admit irreversible effects; configure an external Lab" };
    }
    switch (intent.intent) {
      case "request_human_approval": {
        const targets = (intent.args?.targets as string[]) ?? [];
        const n = await createNotification(intent.userId, {
          title: `Approval requested for ${targets.length} item(s)`,
          body: intent.reason, source: "lab",
        });
        return { dispatched: true, provider: "local", receipt: { notificationId: n.id, targets } };
      }
      case "create_process": {
        const t = await createTask(intent.userId, {
          title: String(intent.args?.title ?? intent.reason ?? "Lab process"),
          description: intent.args?.description as string | undefined,
        });
        return { dispatched: true, provider: "local", receipt: { taskId: t.id } };
      }
      case "register_act":
      default: {
        await logToolCall(intent.userId, `lab:${intent.intent}`, intent.args ?? {}, { admitted: true });
        return { dispatched: true, provider: "local", receipt: { recorded: true, intent: intent.intent } };
      }
    }
  },
};
