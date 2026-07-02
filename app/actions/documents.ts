"use server";

import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import {
  createDocument,
  deleteDocumentChunks,
  getDocumentsForUser,
  insertDocumentChunks,
  updateDocumentStatus,
} from "@/lib/db/documents";
import { getServerViewer } from "@/lib/session";
import { getSetupStatus } from "@/lib/setup";
import { chunkText } from "@/lib/rag/chunking";
import { generateEmbeddings } from "@/lib/rag/embedding";
import { db } from "@/lib/db/client";
import { document } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function uploadDocument(formData: FormData) {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    throw new Error("App is not ready.");
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    throw new Error("You must be signed in to upload documents.");
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("No file provided.");
  }

  const blob = await put(`documents/${randomUUID()}-${file.name}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  const doc = await createDocument(viewer.id, file.name, file.type);

  // Drain the `pending` document asynchronously: respond now, embed after the
  // response is sent. `after()` keeps the serverless function alive until the
  // indexing promise settles (a bare fire-and-forget can be frozen mid-embed).
  // The document stays `pending`/`indexing` until ready; retrieval only reads
  // `ready` rows, so search never sees a half-indexed document.
  after(() => indexDocument(doc.id, viewer.id, blob.url, file.type));

  revalidatePath("/");

  return {
    documentId: doc.id,
    filename: file.name,
    url: blob.url,
  };
}

export async function getDocumentsAction() {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    return [];
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    return [];
  }

  return getDocumentsForUser(viewer.id);
}

export async function deleteDocumentAction(documentId: string) {
  const setupStatus = await getSetupStatus();

  if (!setupStatus.appReady) {
    throw new Error("App is not ready.");
  }

  const viewer = await getServerViewer(setupStatus);

  if (!viewer) {
    throw new Error("You must be signed in.");
  }

  await deleteDocumentChunks(documentId);
  await db.delete(document).where(eq(document.id, documentId));
  revalidatePath("/");
}

async function indexDocument(documentId: string, userId: string, url: string, mediaType: string) {
  try {
    await updateDocumentStatus(documentId, "indexing");

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch document: ${response.status}`);
    }

    let text: string;

    if (mediaType.startsWith("text/") || mediaType === "application/json") {
      text = await response.text();
    } else {
      throw new Error(`Unsupported document type: ${mediaType}`);
    }

    const chunks = chunkText(text);
    const embeddings = await generateEmbeddings(chunks);
    const indexedChunks = chunks.map((content, index) => ({
      chunkIndex: index,
      content,
      embedding: embeddings[index],
    }));

    await insertDocumentChunks(documentId, userId, indexedChunks);
    await updateDocumentStatus(documentId, "ready");
  } catch (error) {
    await updateDocumentStatus(documentId, "error");
    // eslint-disable-next-line no-console
    console.error("Failed to index document:", error);
  }
}
