import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { entityLabel } from "@/engine/world";
import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns, loadRun } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

/** `loadPacks` skips a pack that no longer loads, so one bad pack cannot 500 every Run page. */
const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

type PackView = { tools: Record<string, ToolDef>; principalLabel: string; injectedLabel: string };

/**
 * The three things the Run page needs from the Run's own pack: its tools, for generic per-Event
 * formatting; its principal's label, for the World diff's out-of-scope reads counter; and the label
 * of the collection this Run's Attack injected into, so a Violation's "Source:" line is worded from
 * the pack rather than from any one domain. All empty if the pack is gone or unloadable — a Run
 * whose pack was deleted still renders.
 */
function packViewFor(packId: string, injectedCollection: string | undefined): PackView {
  const empty: PackView = { tools: {}, principalLabel: "", injectedLabel: "" };
  try {
    if (!listPackIds().includes(packId)) return empty;
    const pack = loadPack(packId);
    return {
      tools: pack.tools,
      principalLabel: entityLabel(pack, pack.meta.principal),
      injectedLabel: injectedCollection ? entityLabel(pack, injectedCollection) : "",
    };
  } catch {
    return empty;
  }
}

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  const { tools, principalLabel, injectedLabel } = packViewFor(run.packId, run.attack?.mutation.collection);
  return (
    <RunPage
      id={id}
      initialRun={run}
      packs={packs()}
      tools={tools}
      principalLabel={principalLabel}
      injectedLabel={injectedLabel}
      recent={listRuns()}
    />
  );
}
