import { defineAgent } from "eve";

export default defineAgent({
  description:
    "A focused research specialist. Use for gathering facts, comparing options, or investigating a topic before the parent agent responds. Provide all needed context in the message.",
  model: "anthropic/claude-sonnet-4.5",
});
