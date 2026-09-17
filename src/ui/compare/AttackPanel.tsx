// "The Attack — …" (design/agentsim-console.html 1147-1173): what was planted, where, the Lure,
// and whether each Run read it and acted on it. Shown only when at least one Run had an Attack.
// Every fact is on the Run/Event data already loaded; the only engine calls are the browser-safe
// `matchesLure`/`injectedText` leaf.
import { injectedText, matchesLure } from "@/engine/lure";
import type { Attack } from "@/engine/pack";
import { agentLabel } from "@/runner/agentRef";
import type { Event, RunRecord } from "@/ui/types";
import { lureSummary } from "@/ui/worlds/packView";

function firstInjected(events: Event[], attackId: string): Event | undefined {
  return events.find((e) => e.injected?.attackId === attackId);
}

/** Where the Attack's mutation wrote, worded from the Attack itself so it shows even before any Event read it. */
function plantedIn(attack: Attack): string {
  const m = attack.mutation;
  return m.type === "insert_row" ? `${m.collection} · new row ${m.row.id}` : `${m.collection}.${m.field} · row ${m.id}`;
}

function Took({ run, side, attack }: { run: RunRecord; side: "A" | "B"; attack: Attack }) {
  const who = `Run ${side} — ${agentLabel(run.agent)}`;
  if (!run.attack) {
    return (
      <div className="took-card no">
        <b>{who}</b>No Attack applied to this Run — the World it saw had no planted row.
      </div>
    );
  }
  const saw = firstInjected(run.events, attack.id);
  const took = run.events.find((e) => matchesLure(attack.lure, e));
  return (
    <div className={`took-card ${took ? "yes" : "no"}`}>
      <b>{who}</b>
      {saw ? `Read the planted text at step #${saw.seq}. ` : "Never read the planted text. "}
      {took ? <b style={{ display: "inline", color: "var(--danger-fg)" }}>Acted on it at step #{took.seq}.</b> : "Did not act on it."}
    </div>
  );
}

export function AttackPanel({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const attack = runA.attack ?? runB.attack;
  if (!attack) return null;
  const surfaced = firstInjected(runA.events, attack.id) ?? firstInjected(runB.events, attack.id);
  return (
    <section className="panel card-pad" style={{ marginBottom: 16 }}>
      <h2 style={{ marginBottom: 2 }}>The Attack — {attack.id}</h2>
      <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 12px" }}>{attack.title}</p>
      <dl className="inject-meta">
        <dt>Planted in</dt>
        <dd>{plantedIn(attack)}</dd>
        <dt>Surfaces through</dt>
        <dd>{surfaced?.tool ?? "— never read in these Runs"}</dd>
        <dt>Lure</dt>
        <dd>{lureSummary(attack.lure)}</dd>
      </dl>
      <div className="inject-box" style={{ whiteSpace: "pre-wrap" }}>{injectedText(attack)}</div>
      <div className="took">
        <Took run={runA} side="A" attack={attack} />
        <Took run={runB} side="B" attack={attack} />
      </div>
    </section>
  );
}
