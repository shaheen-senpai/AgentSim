import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { listRuns, loadRun, type RunRecord } from "@/runner/store";
import { entityLabel } from "@/engine/world";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { CompareRunColumn } from "@/ui/CompareRunColumn";
import { RunPicker } from "@/ui/compare/RunPicker";
// Imported from its own plain module, not from `@/ui/RunsListPage` (a "use client" component that
// re-exports the same function for its own use) — this file is a Server Component and calls
// `latestComparablePair` during render, which Next's server/client boundary only allows when the
// function's defining module carries no "use client" directive.
import { latestComparablePair } from "@/ui/compare/latestComparablePair";
import { serif } from "@/ui/styles";

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
  if (!aId || !bId) {
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
          <RunPicker runs={runs} a={runs.find((r) => r.status === "completed")?.id ?? ""} b="" />
        </div>
      </ConsoleShell>
    );
  }

  const ra = loadRun(aId);
  const rb = loadRun(bId);
  if (!ra || !rb) notFound();
  const va = packViewFor(ra), vb = packViewFor(rb);

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-4">
        <h1 className={`${serif} text-[28px] font-medium tracking-tight`}>Compare runs</h1>
        <RunPicker runs={runs} a={ra.id} b={rb.id} />
        <div className="grid grid-cols-2 gap-4">
          <CompareRunColumn run={ra} tools={va.tools} packError={va.error} injectedLabel={va.injectedLabel} />
          <CompareRunColumn run={rb} tools={vb.tools} packError={vb.error} injectedLabel={vb.injectedLabel} />
        </div>
        {/* AttackPanel — added by Task 3 */}
        {/* ActionLedger — added by Task 5 */}
        {/* ChecksTable — added by Task 4 */}
        {/* WorldDiffCompare — added by Task 3 */}
      </div>
    </ConsoleShell>
  );
}
