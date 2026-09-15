import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { entityLabel } from "@/engine/world";
import { loadRun, type RunRecord } from "@/runner/store";
import { Header } from "@/ui/Header";
import { CompareRunColumn } from "@/ui/CompareRunColumn";

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
  const ra = a ? loadRun(a) : null, rb = b ? loadRun(b) : null;
  if (!ra || !rb) notFound();
  const va = packViewFor(ra), vb = packViewFor(rb);
  return (
    <div className="min-h-screen text-sm overflow-x-hidden">
      <Header run={ra} />
      <div className="grid grid-cols-2 gap-4 p-4 h-[calc(100vh-48px)]">
        <CompareRunColumn run={ra} tools={va.tools} packError={va.error} injectedLabel={va.injectedLabel} />
        <CompareRunColumn run={rb} tools={vb.tools} packError={vb.error} injectedLabel={vb.injectedLabel} />
      </div>
    </div>
  );
}
