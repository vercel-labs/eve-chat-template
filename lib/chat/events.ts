import type { HandleMessageStreamEvent } from "eve/client";

export function isChatTurnSettledEvent(event: HandleMessageStreamEvent) {
  return (
    event.type === "session.completed" ||
    event.type === "session.failed" ||
    event.type === "session.waiting" ||
    event.type === "turn.completed"
  );
}
