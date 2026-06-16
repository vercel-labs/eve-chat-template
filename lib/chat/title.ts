import { headers } from "next/headers";
import { Client } from "eve/client";

export const DEFAULT_CHAT_TITLE = "New chat";

export function createFallbackTitle(input: string) {
  const text = input
    .replace(/\s+/g, " ")
    .replace(/[`*_#>]/g, "")
    .trim();

  if (!text) {
    return DEFAULT_CHAT_TITLE;
  }

  const words = text.split(" ").slice(0, 7).join(" ");
  return truncateTitle(words);
}

export async function generateTitleWithEve(firstMessage: string) {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const cookie = requestHeaders.get("cookie");
  const client = new Client({
    host: `${protocol}://${host}`,
    headers: cookie ? { cookie } : undefined,
  });
  const session = client.session();
  const response = await session.send({
    message: [
      "Generate a concise title for this chat.",
      "Use 3 to 7 words.",
      "Return only the title, with no quotes or punctuation at the end.",
      "",
      `User message: ${firstMessage}`,
    ].join("\n"),
  });
  const result = await response.result();

  return cleanTitle(result.message) ?? createFallbackTitle(firstMessage);
}

function cleanTitle(title: string | undefined) {
  const cleaned = title
    ?.replace(/^["'`]+|["'`.!?\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) {
    return null;
  }

  return truncateTitle(cleaned);
}

function truncateTitle(title: string) {
  return title.length > 72 ? `${title.slice(0, 69).trimEnd()}...` : title;
}
