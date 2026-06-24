import { connect, type EveAuthorizationInput } from "@vercel/connect/eve";
import type { ConnectionAuthDefinition } from "eve/connections";

export function connectAuth(input: EveAuthorizationInput): ConnectionAuthDefinition {
  const { evict: _evict, ...auth } = connect(input);
  return auth;
}
