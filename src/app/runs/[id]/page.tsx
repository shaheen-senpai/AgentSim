import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { loadPacks } from "@/lib/summaries";
import { entityLabel } from "@/engine/world";
import { isGoldenRun, loadRun } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { RunPage } from "@/ui/run/RunPage";

export const dynamic = "force-dynamic";

type PackView = { tools: Record<string, ToolDef>; systems: string[]; principalLabel: string; injectedLabel: string; packName: string };

/**
 * What the Run page needs from the Run's own pack: its tools (per-Event formatting and read/write),
 * its Systems (stable colours), its principal's label (the World diff's reads counter) and the label
 * of the collection this Run's Attack injected into (a Violation's "Source:" line). All empty when
 * the pack is gone or unloadable — a Run whose pack was deleted still renders.
 */
function packViewFor(packId: string | undefined, scenarioId: string, injectedCollection: string | undefined): PackView {
  const empty: PackView = { tools: {}, systems: [], principalLabel: "", injectedLabel: "", packName: "" };
  try {
    // A v1 record has no `packId`; the pack that declares its Scenario is the next best guess.
    const pack = packId && listPackIds().includes(packId) ? loadPack(packId) : loadPacks().packs.find((p) => p.scenarios.some((s) => s.id === scenarioId));
    if (!pack) return empty;
    return {
      tools: pack.tools,
      systems: Object.keys(pack.meta.systems).sort(),
      principalLabel: entityLabel(pack, pack.meta.principal),
      injectedLabel: injectedCollection ? entityLabel(pack, injectedCollection) : "",
      packName: pack.meta.name,
    };
  } catch {
    return empty;
  }
}

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  const { packName, ...view } = packViewFor(run.packId, run.scenarioId, run.attack?.mutation.collection);
  // A v1 record names no pack; the pack that owns its Scenario does.
  const initialRun = run.packName ? run : { ...run, packName: packName || run.packId || "" };
  return (
    <ConsoleShell>
      <RunPage id={id} initialRun={initialRun} {...view} golden={isGoldenRun(id)} />
    </ConsoleShell>
  );
}
