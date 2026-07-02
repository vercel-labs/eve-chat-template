import { defineTool } from "eve/tools";
import { z } from "zod";
import { logToolCall } from "@/lib/db/audit";
import { completeTask } from "@/lib/db/tasks";

export default defineTool({
  description:
    "Mark a task as completed. Use when the work described in a task is done. Include verification notes explaining how completion was confirmed.",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to complete."),
    verificationNotes: z.string().optional().describe("Notes explaining how completion was verified."),
  }),
  async execute({ taskId, verificationNotes }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot complete task without an authenticated user.");
    }

    const task = await completeTask(userId, taskId, verificationNotes);
    await logToolCall(userId, "complete_task", { taskId, verificationNotes }, task);

    return {
      completed: task.status === "completed",
      id: task.id,
      title: task.title,
      status: task.status,
    };
  },
});
