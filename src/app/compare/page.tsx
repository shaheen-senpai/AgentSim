import { notFound } from "next/navigation";
import { listPackIds, loadPack, type Check, type ToolDef } from "@/engine/pack";
import { listRuns, loadRun, type RunRecord } from "@/runner/store";
import { entityLabel } from "@/engine/world";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { CompareRunColumn } from "@/ui/CompareRunColumn";
import { RunPicker } from "@/ui/compare/RunPicker";
import { AttackPanel } from "@/ui/compare/AttackPanel";
import { ActionLedger } from "@/ui/compare/ActionLedger";
import { ChecksTable } from "@/ui/compare/ChecksTable";
import { WorldDiffCompare } from "@/ui/compare/WorldDiffCompare";
// Imported from its own plain module, not from `@/ui/RunsListPage` (a "use client" component that
// re-exports the same function for its own use) — this file is a Server Component and calls
// `latestComparablePair` during render, which Next's server/client boundary only allows when the
// function's defining module carries no "use client" directive.
import { latestComparablePair } from "@/ui/compare/latestComparablePair";
import { heading, serif } from "@/ui/styles";

export const dynamic = "force-dynamic";

type ColumnView = { tools: Record<string, ToolDef>; injectedLabel: string; error: string | null };

/**
 * A Run's pack's tools — for that column's flow — and the label of the collection its Attack
 * injected into, for a Violation's "Source:" line. Both resolved server-side (this file may import
 * `@/engine/pack` freely; `CompareRunColumn` and everything under it, being client components,
 * may not). The two Runs being compared can come from different World packs, so each column
 * resolves and degrades independently: a pack that no longer exists or fails to parse never
 * crashes the page — it just leaves that column without a flow.
 */
function packViewFor(run: RunRecord): ColumnView {
  const { packId } = run;
  const injected = run.attack?.mutation.collection;
  try {
    if (!listPackIds().includes(packId)) return { tools: {}, injectedLabel: "", error: `World pack "${packId}" is no longer available — no flow to show.` };
    const pack = loadPack(packId);
    return { tools: pack.tools, injectedLabel: injected ? entityLabel(pack, injected) : "", error: null };
  } catch {
    return { tools: {}, injectedLabel: "", error: `World pack "${packId}" failed to load — no flow to show.` };
  }
}

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const runs = listRuns();

  let aId = a, bId = b;
  // Only fall back to the latest comparable pair when *neither* query param was given at all (e.g.
  // landing on `/compare` directly). `RunPicker`'s A select navigates to `?a=<id>&b=` when the
  // newly-picked Run A has no Scenario peer — falling back here on a missing `b` alone would
  // silently discard that choice and overwrite both ids (Finding 5).
  if (!aId && !bId) {
    const pair = latestComparablePair(runs);
    if (pair) {
      aId = pair.a.id;
      bId = pair.b.id;
    }
  }

  if (!aId || !bId) {
    return (
      <ConsoleShell>
        <div className="p-4 flex flex-col gap-4 max-w-[720px]">
          <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Compare runs</h1>
          <p className="text-[13px] text-[#6E6B60]">Pick two Runs of the same Scenario to compare.</p>
          {/* `aId` is preserved when the user just picked a Run A with no peer, rather than being
              overridden by the "first completed Run" default — that default only applies when
              nothing was picked at all. */}
          <RunPicker runs={runs} a={aId ?? runs.find((r) => r.status === "completed")?.id ?? ""} b={bId ?? ""} />
        </div>
      </ConsoleShell>
    );
  }

  const ra = loadRun(aId);
  const rb = loadRun(bId);
  if (!ra || !rb) notFound();
  const va = packViewFor(ra), vb = packViewFor(rb);

  // `packId` too, not just `scenarioId` — two Runs from different packs can share a `scenarioId`
  // string and would otherwise compare against the wrong pack's Checks (Finding 9).
  const sameScenario = ra.scenarioId === rb.scenarioId && ra.packId === rb.packId;
  let sharedChecks: Check[] = [];
  if (sameScenario) {
    try {
      const pack = loadPack(ra.packId);
      const scenario = pack.scenarios.find((s) => s.id === ra.scenarioId);
      sharedChecks = scenario?.checks ?? [];
    } catch {
      sharedChecks = [];
    }
  }
  // `lure_not_taken` (the synthesized Safety Check every Attack implies) is added at evaluation
  // time only (`src/engine/evaluator.ts` → `lureCheck`) and is never part of `scenario.checks` —
  // so without this, the Checks table's Safety dimension is always empty and gets dropped, even
  // though both the score header and the Attack panel/Action ledger report the Lure (Finding 2).
  // Synthesized whenever *either* Run was attacked — the same condition `AttackPanel.tsx` already
  // gates its whole section on (`runA.attack ?? runB.attack`). No special-casing is needed for a
  // clean-vs-attacked pair: `checkOutcomes`'s matching only needs the Check's key to exist to render
  // the row — a Run with no Attack (or a different one) correctly comes back "passed" for this
  // Attack's `lure_not_taken` key by construction, since its own `violations` array simply never
  // contains that key. Shaped to match `lureCheck`'s own Violation exactly (`src/engine/checks.ts`)
  // so it produces the identical `checkKey`/`violationKey` in `compareLedger.ts` with zero changes
  // there.
  if (ra.attack || rb.attack) {
    const attack = ra.attack ?? rb.attack!;
    sharedChecks = [
      ...sharedChecks,
      { type: "lure_not_taken", dimension: "safety", attack: attack.id, lure: attack.lure } as unknown as Check,
    ];
  }

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-4">
        <div>
          <div className={heading}>AgentSim</div>
          <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Compare runs</h1>
        </div>
        <p className="text-[13px] text-[#6E6B60] max-w-[70ch]">
          Two Runs of the same Scenario, step by step — what each agent called, what came back, and where they diverged.
        </p>
        <RunPicker runs={runs} a={ra.id} b={rb.id} />
        {/* Stacks to one column below `md`, like every other side-by-side section on this page
            (`AttackPanel`, `ActionLedger`, `WorldDiffCompare`). The flow's own bounded height lives
            inside `CompareRunColumn` now — see the comment there — because `CompareColumn`'s natural
            height varies a lot with how much a Run's score header wraps, so a single fixed height
            shared across the whole row (header + flow) doesn't hold up across Runs or breakpoints. */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CompareRunColumn run={ra} tools={va.tools} packError={va.error} injectedLabel={va.injectedLabel} />
          <CompareRunColumn run={rb} tools={vb.tools} packError={vb.error} injectedLabel={vb.injectedLabel} />
        </div>
        <AttackPanel runA={ra} runB={rb} />
        <ActionLedger runA={ra} runB={rb} />
        {sharedChecks.length > 0 && <ChecksTable checks={sharedChecks} violationsA={ra.violations} violationsB={rb.violations} />}
        <WorldDiffCompare runA={ra} runB={rb} />
      </div>
    </ConsoleShell>
  );
}
