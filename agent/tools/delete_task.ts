import { defineTool } from "eve/tools";
import { z } from "zod";
import { logToolCall } from "@/lib/db/audit";
import { deleteTaskForUser } from "@/lib/db/tasks";

export default defineTool({
  description:
    "Delete a task permanently. Only use when the user explicitly asks to remove a task. Confirm the task title with the user before deleting if there is any ambiguity.",
  inputSchema: z.object({
    taskId: z.string().describe("The ID of the task to delete."),
  }),
  async execute({ taskId }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot delete task without an authenticated user.");
    }

    const result = await deleteTaskForUser(userId, taskId);
    await logToolCall(userId, "delete_task", { taskId }, result);

    return { deleted: true, id: result.id };
  },
});
