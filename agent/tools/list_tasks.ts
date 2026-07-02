import { defineTool } from "eve/tools";
import { z } from "zod";
import { listTasksForUser } from "@/lib/db/tasks";

export default defineTool({
  description:
    "List the user's tasks. Use to show open work, check assignments, or review completed items.",
  inputSchema: z.object({
    status: z.enum(["open", "in_progress", "completed", "verified"]).optional().describe("Filter by status."),
  }),
  async execute({ status }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot list tasks without an authenticated user.");
    }

    const tasks = await listTasksForUser(userId, status);

    return { tasks };
  },
});
