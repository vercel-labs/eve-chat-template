import { embed } from "ai";
import { openai } from "@ai-sdk/openai";

export const EMBEDDING_DIMENSIONS = 1536;
export const EMBEDDING_MODEL = "text-embedding-3-small";

export async function generateEmbedding(text: string) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }

  const { embedding } = await embed({
    model: openai.embedding(EMBEDDING_MODEL),
    value: text.trim(),
  });

  return embedding;
}
