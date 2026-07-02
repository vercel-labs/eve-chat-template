import { defineTool } from "eve/tools";
import { z } from "zod";
import { logToolCall } from "@/lib/db/audit";
import { deleteDocumentForUser } from "@/lib/db/documents";

export default defineTool({
  description:
    "Delete a knowledge base document permanently. Only use when the user explicitly asks to remove a document. Confirm the document name with the user before deleting if there is any ambiguity.",
  inputSchema: z.object({
    documentId: z.string().describe("The ID of the document to delete."),
  }),
  async execute({ documentId }, ctx) {
    const userId = ctx.session.auth.current?.principalId;

    if (!userId) {
      throw new Error("Cannot delete document without an authenticated user.");
    }

    const result = await deleteDocumentForUser(userId, documentId);
    await logToolCall(userId, "delete_document", { documentId }, result);

    return { deleted: true, id: result.id, filename: result.filename };
  },
});
