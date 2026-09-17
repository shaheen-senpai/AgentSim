// The exchange a driven Run recorded, as data. The panel that renders it is
// `src/workspace/run/ConversationPanel.tsx`; this stays the pure, tested half (`tests/ui/agentReply.test.ts`).
import type { RunRecord } from "./types";

export type Turn = { role: "counterpart" | "agent"; content: string; label?: string };

/** The exchange a driven Run recorded, oldest first. Empty for a Run that was not driven. */
export function conversationOf(run: RunRecord | null): Turn[] {
  const raw = run?.transcript;
  if (!Array.isArray(raw)) return [];
  return raw.filter((t): t is Turn => {
    if (!t || typeof t !== "object") return false;
    const { role, content } = t as { role?: unknown; content?: unknown };
    return (role === "counterpart" || role === "agent") && typeof content === "string";
  });
}
