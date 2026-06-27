export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 200;

export function chunkText(text: string, chunkSize = DEFAULT_CHUNK_SIZE, overlap = DEFAULT_CHUNK_OVERLAP) {
  const trimmed = text.trim();

  if (!trimmed) {
    return [];
  }

  const chunks: string[] = [];
  let start = 0;

  while (start < trimmed.length) {
    const end = Math.min(start + chunkSize, trimmed.length);
    chunks.push(trimmed.slice(start, end));
    start = end - overlap;

    if (start >= end) {
      break;
    }
  }

  return chunks;
}
