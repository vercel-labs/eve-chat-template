import { defineTool } from "eve/tools";
import { z } from "zod";
import { setMemoryValue } from "@/lib/db/memory";

export default defineTool({
  description:
    "Save a fact about the user for future conversations. Provide a short key and a concise value. Use when the user shares preferences, goals, constraints, or important context that should persist across chats.",
  inputSchema: z.object({
    key: z.string().min(1).describe("A short, unique identifier for the memory, e.g. 'preferred-name' or 'tech-stack'."),
    source: z.string().optional().describe("Optional note about where this memory came from."),
    value: z.string().min(1).describe("The fact to remember."),
  }),
  async execute({ key, value, source }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot save memory without an authenticated user.");
    }

    const saved = await setMemoryValue(userId, key, value, source);

    return {
      key: saved.key,
      saved: true,
      value: saved.value,
    };
  },
});
