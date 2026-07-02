import { defineTool } from "eve/tools";
import { z } from "zod";
import { logToolCall } from "@/lib/db/audit";
import { createTask } from "@/lib/db/tasks";

export default defineTool({
  description:
    "Create a task to track work that needs to be done. Use when the user asks for something that should be deferred, assigned, or verified later.",
  inputSchema: z.object({
    assignedTo: z.string().optional().describe("Optional identifier for who should handle the task."),
    description: z.string().optional().describe("Optional details about what needs to be done."),
    title: z.string().min(1).describe("A short title for the task."),
  }),
  async execute({ title, description, assignedTo }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot create task without an authenticated user.");
    }

    const task = await createTask(userId, { title, description, assignedTo });
    await logToolCall(userId, "create_task", { title, description, assignedTo }, task);

    return { created: true, id: task.id, title: task.title, status: task.status };
  },
});
