// The pack behind a Run record, tolerant of the two ways a record can fail to name one: a pack that
// was deleted or no longer loads, and a v1 record that predates `packId` and names only its Scenario.
import { listPackIds, loadPack, type WorldPack } from "@/engine/pack";
import { loadPacks } from "@/lib/summaries";
import type { RunRecord } from "@/runner/store";

/** `null` when no installed pack can be matched — the page then renders without pack-derived facts. */
export function packForRun(run: Pick<RunRecord, "packId" | "scenarioId">): WorldPack | null {
  try {
    if (run.packId && listPackIds().includes(run.packId)) return loadPack(run.packId);
    return loadPacks().packs.find((p) => p.scenarios.some((s) => s.id === run.scenarioId)) ?? null;
  } catch {
    return null;
  }
}

/** The record with `packName` filled from its pack when the stored record has none. */
export function withPackName(run: RunRecord, pack: WorldPack | null): RunRecord {
  return run.packName ? run : { ...run, packName: pack?.meta.name ?? run.packId ?? "" };
}
