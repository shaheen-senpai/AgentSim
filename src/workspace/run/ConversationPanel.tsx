// What was said, for a Run AgentSim drove over HTTP. Nothing here is scored: until tool calls are
// routed back through the gateway, a driven Run produces no Events, so the conversation is the only
// thing it leaves behind and the Trust Score beside it is about an untouched World.
import { conversationOf } from "@/ui/AgentReplyPanel";
import type { RunRecord } from "@/ui/types";
import { Clamp } from "../Clamp";
import { card, eyebrow } from "../ui";

export function ConversationPanel({ run }: { run: RunRecord }) {
  const turns = conversationOf(run);
  if (turns.length === 0) return null;
  return (
    <section className={`${card} min-w-0 overflow-hidden p-5`} aria-labelledby="run-conversation-title">
      <h2 id="run-conversation-title" className={eyebrow}>Conversation</h2>
      <div className="mt-3 flex flex-col gap-3">
        {turns.map((t, i) => (
          <div key={i} className="min-w-0">
            <p className="truncate font-label text-label-sm uppercase text-muted-foreground">{t.role === "agent" ? "Agent" : (t.label ?? "Counterpart")}</p>
            <Clamp text={t.content} lines={6} className={`mt-1 text-body [overflow-wrap:anywhere] ${t.role === "agent" ? "text-foreground" : "text-muted-foreground"}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
