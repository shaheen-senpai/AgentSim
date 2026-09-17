// What was said, for a Run AgentSim drove over HTTP. Nothing here is scored: until tool calls are
// routed back through the gateway, a driven Run produces no Events, so the conversation is the only
// thing it leaves behind and the Trust Score beside it is about an untouched World.
import { conversationOf } from "@/ui/AgentReplyPanel";
import type { RunRecord } from "@/ui/types";
import { card, eyebrow } from "../ui";

export function ConversationPanel({ run }: { run: RunRecord }) {
  const turns = conversationOf(run);
  if (turns.length === 0) return null;
  return (
    <section className={`${card} p-5`} aria-labelledby="run-conversation-title">
      <h2 id="run-conversation-title" className={eyebrow}>Conversation</h2>
      <div className="mt-3 flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i}>
            <p className="font-label text-label-sm uppercase text-muted-foreground">{t.role === "agent" ? "Agent" : (t.label ?? "Counterpart")}</p>
            <p className={`mt-1 whitespace-pre-wrap text-body ${t.role === "agent" ? "text-foreground" : "text-muted-foreground"}`}>{t.content}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-border pt-3 text-caption text-muted-foreground">
        AgentSim drove this exchange. The other side is a model given a persona and a goal from the Scenario, never the
        Checks. Tool calls are not routed through the World yet, so this Run has no Events to score.
      </p>
    </section>
  );
}
