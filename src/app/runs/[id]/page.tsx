import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { entityLabel } from "@/engine/world";
import { toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns, loadRun } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

const packs = (): PackOption[] => listPackIds().map((id) => toPackOption(loadPack(id)));

/**
 * The two things the Run page needs from the Run's own pack: its tools, for generic per-Event
 * formatting, and its principal's label, for the World diff's out-of-scope reads counter. Both
 * empty if the pack is gone or unloadable — a Run whose pack was deleted still renders.
 */
function packViewFor(packId: string): { tools: Record<string, ToolDef>; principalLabel: string } {
  try {
    if (!listPackIds().includes(packId)) return { tools: {}, principalLabel: "" };
    const pack = loadPack(packId);
    return { tools: pack.tools, principalLabel: entityLabel(pack, pack.meta.principal) };
  } catch {
    return { tools: {}, principalLabel: "" };
  }
}

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  const { tools, principalLabel } = packViewFor(run.packId);
  return <RunPage id={id} initialRun={run} packs={packs()} tools={tools} principalLabel={principalLabel} recent={listRuns()} />;
}
