import { listPackIds, loadPack } from "@/engine/pack";
import { toPackOption } from "@/lib/summaries";
import { toSummary } from "@/runner/store";
import { RunView } from "@/ui/RunView";
import { FIXTURE_RUN } from "@/ui/fixture";

// Launcher reads ?packId=/?scenarioId= via useSearchParams(), which Next.js requires a Suspense
// boundary for on a *statically* prerendered page — force-dynamic (as every other page here does)
// sidesteps that instead, matching how `/` and `/runs/[id]` are already rendered.
export const dynamic = "force-dynamic";

export default function DevPreview() {
  const packs = listPackIds().map((id) => toPackOption(loadPack(id)));
  const tools = loadPack(FIXTURE_RUN.packId).tools;
  return <RunView run={FIXTURE_RUN} packs={packs} tools={tools} recent={[toSummary(FIXTURE_RUN, true)]} />;
}
