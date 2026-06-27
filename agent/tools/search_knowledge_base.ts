import { defineTool } from "eve/tools";
import { z } from "zod";
import { generateEmbedding } from "@/lib/rag/embedding";
import { searchDocumentChunks } from "@/lib/db/documents";

export default defineTool({
  description:
    "Search the user's uploaded knowledge base for relevant context. Use when the user asks about documents they have uploaded or when grounded information is needed.",
  inputSchema: z.object({
    query: z.string().min(1).describe("The search query."),
    topK: z.number().int().min(1).max(10).optional().describe("Number of chunks to return."),
  }),
  async execute({ query, topK = 5 }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot search knowledge base without an authenticated user.");
    }

    const embedding = await generateEmbedding(query);
    const results = await searchDocumentChunks(userId, embedding, topK);

    return {
      results: results.map((result) => ({
        content: result.content,
        documentId: result.documentId,
        score: result.score,
      })),
    };
  },
});
