import { resolveEmbeddingProvider, EMBEDDING_MODEL } from "./providers";

// Public embedding API. Both paths resolve the active provider from the seam
// (EMBEDDING_PROVIDER, default `gateway`), so swapping providers is a config
// choice, not a rewrite. The vector(1536) column matches the gateway default.
export const EMBEDDING_DIMENSIONS = 1536;
export { EMBEDDING_MODEL };

export async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await resolveEmbeddingProvider().embed([text]);
  return embedding;
}

// Batch path for ingestion — one round trip for a whole document's chunks.
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  return resolveEmbeddingProvider().embed(texts);
}
