import { defineTool } from "eve/tools";
import { z } from "zod";

const TEXT_MEDIA_TYPES = [
  "text/",
  "application/json",
  "application/javascript",
  "application/typescript",
  "application/xml",
  "application/sql",
  "application/markdown",
  "application/x-sh",
];

function isTextMediaType(mediaType: string) {
  return TEXT_MEDIA_TYPES.some((prefix) => mediaType.toLowerCase().startsWith(prefix));
}

export default defineTool({
  description:
    "Read the contents of a previously uploaded file. Provide the file URL and media type. Returns text for text-based files or metadata for binary files.",
  inputSchema: z.object({
    mediaType: z.string().describe("The media type of the file, e.g. text/plain or application/pdf."),
    url: z.string().describe("The public URL of the uploaded file."),
  }),
  async execute({ url, mediaType }) {
    const response = await fetch(url, { method: "GET" });

    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status} ${response.statusText}`);
    }

    if (isTextMediaType(mediaType)) {
      const text = await response.text();

      return {
        mediaType,
        size: text.length,
        text: text.slice(0, 50_000),
        truncated: text.length > 50_000,
        url,
      };
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    return {
      base64: base64.slice(0, 50_000),
      mediaType,
      size: arrayBuffer.byteLength,
      truncated: base64.length > 50_000,
      url,
    };
  },
});
