import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { loadRun } from "@/runner/store";
import { Header } from "@/ui/Header";
import { CompareRunColumn } from "@/ui/CompareRunColumn";

export const dynamic = "force-dynamic";

/**
 * A Run's pack's tools, for that column's flow — resolved server-side (this file may import
 * `@/engine/pack` freely; `CompareRunColumn` and everything under it, being client components,
 * may not). The two Runs being compared can come from different World packs, so each column
 * resolves and degrades independently: a pack that no longer exists or fails to parse never
 * crashes the page — it just leaves that column without a flow.
 */
function toolsFor(packId: string): { tools: Record<string, ToolDef>; error: string | null } {
  try {
    if (!listPackIds().includes(packId)) return { tools: {}, error: `World pack "${packId}" is no longer available — no flow to show.` };
    return { tools: loadPack(packId).tools, error: null };
  } catch {
    return { tools: {}, error: `World pack "${packId}" failed to load — no flow to show.` };
  }
}

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const ra = a ? loadRun(a) : null, rb = b ? loadRun(b) : null;
  if (!ra || !rb) notFound();
  const ta = toolsFor(ra.packId), tb = toolsFor(rb.packId);
  return (
    <div className="min-h-screen text-sm overflow-x-hidden">
      <Header run={ra} />
      <div className="grid grid-cols-2 gap-4 p-4 h-[calc(100vh-48px)]">
        <CompareRunColumn run={ra} tools={ta.tools} packError={ta.error} />
        <CompareRunColumn run={rb} tools={tb.tools} packError={tb.error} />
      </div>
    </div>
  );
}
