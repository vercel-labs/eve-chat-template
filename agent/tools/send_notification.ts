import { defineTool } from "eve/tools";
import { z } from "zod";
import { createNotification } from "@/lib/db/notifications";

export default defineTool({
  description:
    "Send an in-app notification to the user. Use when the agent completes work, discovers something important, or needs to surface information without waiting for the next chat message.",
  inputSchema: z.object({
    body: z.string().optional().describe("Optional body text of the notification."),
    source: z.string().optional().describe("Optional source label, e.g. 'daily-check' or 'subagent'."),
    title: z.string().min(1).describe("A short title for the notification."),
  }),
  async execute({ title, body, source }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot send notification without an authenticated user.");
    }

    const notification = await createNotification(userId, { title, body, source });

    return { created: true, id: notification.id, title: notification.title, read: notification.read };
  },
});
