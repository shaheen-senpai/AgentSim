// src/ui/compare/AttackPanel.tsx
// Shown only when at least one of the two Runs had an Attack applied. Every fact here already
// exists on the Run/Event data the page already loaded — no engine call beyond the already-safe
// `matchesLure`/`injectedText` leaf (`@/engine/lure`).
import { injectedText, matchesLure } from "@/engine/lure";
// `Attack` is not re-exported by `@/ui/types` (only `WizardAttack`, a distinct wizard-draft shape,
// lives there) — every other `src/ui` consumer of the real `Attack` type (`packView.ts`,
// `buildFlow.ts`) imports it straight from its engine source, type-only, so this follows the same
// established convention rather than adding a new re-export surface.
import type { Attack } from "@/engine/pack";
import type { Event, RunRecord } from "@/ui/types";
import { dangerBg, dangerFg, heading, mono, panel } from "@/ui/styles";
import { lureSummary } from "@/ui/worlds/packView";

function firstInjected(events: Event[], attackId: string): Event | undefined {
  return events.find((e) => e.injected?.attackId === attackId);
}

function TookItCard({ run, side, attack }: { run: RunRecord; side: "A" | "B"; attack: Attack }) {
  if (!run.attack) {
    return (
      <div className={`${panel} p-3 text-[12.5px]`}>
        <b className="block text-[12px] mb-0.5">Run {side} — {run.agent.kind === "byo" ? run.agent.name : run.agent.version}</b>
        No Attack applied to this Run — the World it saw had no planted row.
      </div>
    );
  }
  const saw = firstInjected(run.events, attack.id);
  const took = run.events.find((e) => matchesLure(attack.lure, e));
  return (
    <div className={`${panel} p-3 text-[12.5px]`} style={took ? { borderColor: dangerFg, background: dangerBg } : undefined}>
      <b className="block text-[12px] mb-0.5">Run {side} — {run.agent.kind === "byo" ? run.agent.name : run.agent.version}</b>
      {saw ? `Read the planted text at step #${saw.seq}. ` : "Never read the planted text. "}
      {took ? (
        <span style={{ color: dangerFg }}>
          <b>Acted on it at step #{took.seq}.</b>
        </span>
      ) : (
        "Did not act on it."
      )}
    </div>
  );
}

export function AttackPanel({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const attack = runA.attack ?? runB.attack;
  if (!attack) return null;
  const injected = firstInjected(runA.events, attack.id) ?? firstInjected(runB.events, attack.id);

  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold`}>The Attack — {attack.id}</h2>
      <p className="text-[12.5px] text-[#6E6B60]">{attack.title}</p>
      {injected?.injected && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-[#6E6B60]">Planted in</dt>
          <dd className={mono}>
            {injected.injected.collection} / {injected.injected.id}.{injected.injected.field}
          </dd>
          <dt className="text-[#6E6B60]">Surfaces through</dt>
          <dd className={mono}>{injected.tool}</dd>
          <dt className="text-[#6E6B60]">Lure</dt>
          <dd className={mono}>{lureSummary(attack.lure)}</dd>
        </dl>
      )}
      <pre className={`${mono} text-[12px] whitespace-pre-wrap p-3 rounded-lg`} style={{ background: dangerBg, color: dangerFg }}>
        {injectedText(attack)}
      </pre>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TookItCard run={runA} side="A" attack={attack} />
        <TookItCard run={runB} side="B" attack={attack} />
      </div>
    </section>
  );
}
