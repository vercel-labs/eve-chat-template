export function formatFileSize(bytes: number) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log10(bytes) / 3), units.length - 1);
  const value = bytes / 10 ** (exponent * 3);

  return `${value.toFixed(1)} ${units[exponent]}`;
}

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function validateAttachmentFile(file: File): string | null {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `File is too large. Max size is ${formatFileSize(MAX_ATTACHMENT_SIZE_BYTES)}.`;
  }

  return null;
}
