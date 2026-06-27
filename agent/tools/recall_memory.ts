import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMemoryForUser, getMemoryValue } from "@/lib/db/memory";

export default defineTool({
  description:
    "Recall a saved fact about the user. Call with a specific key to get one value, or with no key to list all saved memories.",
  inputSchema: z.object({
    key: z.string().optional().describe("The memory key to look up. Omit to list all memories."),
  }),
  async execute({ key }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot recall memory without an authenticated user.");
    }

    if (key) {
      const value = await getMemoryValue(userId, key);

      return {
        key,
        memories: value ? [{ key, value }] : [],
        value,
      };
    }

    const memories = await getMemoryForUser(userId);

    return {
      memories: memories.map((memory) => ({
        key: memory.key,
        value: memory.value,
      })),
    };
  },
});
