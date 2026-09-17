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

/**
 * What was said, for a Run AgentSim drove over HTTP. Nothing here is scored: until tool calls are
 * routed back through the gateway, a driven Run produces no Events, so the conversation is the only
 * thing it leaves behind and the Trust Score beside it is about an untouched World.
 */
export function AgentReplyPanel({ run }: { run: RunRecord | null }) {
  const turns = conversationOf(run);
  if (turns.length === 0) return null;
  return (
    <div className="panel card-pad" style={{ marginBottom: 14 }}>
      <div className="heading" style={{ marginBottom: 10 }}>Conversation</div>
      {turns.map((t, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <span className="field-label">{t.role === "agent" ? "Agent" : (t.label ?? "Counterpart")}</span>
          <p style={{ margin: "4px 0 0", fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: t.role === "agent" ? "var(--ink)" : "var(--muted)" }}>
            {t.content}
          </p>
        </div>
      ))}
      <p className="hint" style={{ margin: 0, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
        AgentSim drove this exchange. The other side is a model given a persona and a goal from the Scenario, never the
        Checks. Tool calls are not routed through the World yet, so this Run has no Events to score.
      </p>
    </div>
  );
}
