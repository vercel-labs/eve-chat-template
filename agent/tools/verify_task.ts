import { defineTool } from "eve/tools";
import { z } from "zod";
import { logToolCall } from "@/lib/db/audit";
import { verifyTask } from "@/lib/db/tasks";

export default defineTool({
  description:
    "Verify the status of a completed task. Use when the user asks whether something was done or when checking the outcome of prior work.",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to verify."),
  }),
  async execute({ taskId }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot verify task without an authenticated user.");
    }

    const task = await verifyTask(userId, taskId);
    await logToolCall(userId, "verify_task", { taskId }, task);

    return {
      id: task.id,
      status: task.status,
      title: task.title,
      verified: task.verified,
      verificationNotes: task.verificationNotes,
    };
  },
});
