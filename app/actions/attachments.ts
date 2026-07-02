"use server";

import { randomUUID } from "node:crypto";
import { put } from "@vercel/blob";
import { db } from "@/lib/db/client";
import { attachment } from "@/lib/db/schema";

export type AttachmentUpload = {
  readonly filename: string;
  readonly mediaType: string;
  readonly size: number;
  readonly url: string;
};

export async function uploadAttachment({
  chatId,
  file,
}: {
  readonly chatId: string;
  readonly file: File;
}): Promise<AttachmentUpload> {
  const id = randomUUID();
  const blob = await put(`attachments/${chatId}/${id}/${file.name}`, file, {
    access: "public",
    addRandomSuffix: false,
    contentType: file.type,
  });

  await db.insert(attachment).values({
    id,
    chatId,
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    size: file.size,
    url: blob.url,
  });

  return {
    filename: file.name,
    mediaType: file.type || "application/octet-stream",
    size: file.size,
    url: blob.url,
  };
}
