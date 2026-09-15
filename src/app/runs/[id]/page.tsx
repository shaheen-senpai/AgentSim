import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns, loadRun } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

const packs = (): PackOption[] => listPackIds().map((id) => toPackOption(loadPack(id)));

/** The Run's pack's tools, for generic per-Event formatting — `{}` if the pack is gone or unloadable. */
function toolsFor(packId: string): Record<string, ToolDef> {
  try {
    return listPackIds().includes(packId) ? loadPack(packId).tools : {};
  } catch {
    return {};
  }
}

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  return <RunPage id={id} initialRun={run} packs={packs()} tools={toolsFor(run.packId)} recent={listRuns()} />;
}
