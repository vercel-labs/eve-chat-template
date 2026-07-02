import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { document, documentChunk } from "@/lib/db/schema";

export async function createDocument(
  userId: string,
  filename: string,
  mediaType: string,
) {
  const id = randomUUID();

  const [row] = await db
    .insert(document)
    .values({
      id,
      userId,
      filename,
      mediaType,
      status: "pending",
    })
    .returning({ id: document.id });

  if (!row) {
    throw new Error("Failed to create document.");
  }

  return row;
}

export async function updateDocumentStatus(
  documentId: string,
  status: "pending" | "indexing" | "ready" | "error",
) {
  await db
    .update(document)
    .set({ status, updatedAt: new Date() })
    .where(eq(document.id, documentId));
}

export async function insertDocumentChunks(
  documentId: string,
  userId: string,
  chunks: { readonly content: string; readonly embedding: number[]; readonly chunkIndex: number }[],
) {
  if (chunks.length === 0) {
    return;
  }

  await db.insert(documentChunk).values(
    chunks.map((chunk) => ({
      id: randomUUID(),
      documentId,
      userId,
      chunkIndex: chunk.chunkIndex,
      content: chunk.content,
      embedding: chunk.embedding,
    })),
  );
}

export async function deleteDocumentChunks(documentId: string) {
  await db.delete(documentChunk).where(eq(documentChunk.documentId, documentId));
}

export async function getDocumentsForUser(userId: string) {
  return db
    .select({
      id: document.id,
      filename: document.filename,
      mediaType: document.mediaType,
      status: document.status,
      createdAt: document.createdAt,
    })
    .from(document)
    .where(eq(document.userId, userId))
    .orderBy(document.createdAt);
}

export async function deleteDocumentForUser(userId: string, documentId: string) {
  await deleteDocumentChunks(documentId);

  const [row] = await db
    .delete(document)
    .where(and(eq(document.id, documentId), eq(document.userId, userId)))
    .returning({ id: document.id, filename: document.filename });

  if (!row) {
    throw new Error("Document not found.");
  }

  return row;
}

export async function searchDocumentChunks(
  userId: string,
  embedding: number[],
  limit = 5,
) {
  const similarity = sql<number>`1 - (${documentChunk.embedding} <=> ${JSON.stringify(embedding)}::vector)`;

  return db
    .select({
      content: documentChunk.content,
      documentId: documentChunk.documentId,
      score: similarity,
    })
    .from(documentChunk)
    .where(and(eq(documentChunk.userId, userId), eq(document.status, "ready")))
    .innerJoin(document, eq(documentChunk.documentId, document.id))
    .orderBy(sql`${similarity} desc`)
    .limit(limit);
}
