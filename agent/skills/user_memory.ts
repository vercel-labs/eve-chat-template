import { defineDynamic, defineSkill } from "eve/skills";
import { getMemoryForUser } from "@/lib/db/memory";

export default defineDynamic({
  events: {
    "session.started": async (_event, ctx) => {
      const userId = ctx.session.auth.current?.principalId;

      if (!userId) {
        return null;
      }

      const memories = await getMemoryForUser(userId);

      if (memories.length === 0) {
        return null;
      }

      const markdown = [
        "# User memory",
        "",
        "The following facts about the user have been saved across conversations:",
        "",
        ...memories.map((memory) => `- **${memory.key}**: ${memory.value}`),
      ].join("\n");

      return defineSkill({
        description: "Use when the user's saved preferences or context are relevant to the answer.",
        markdown,
      });
    },
  },
});
