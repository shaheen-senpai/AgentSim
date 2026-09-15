import { loadPack } from "@/engine/pack";
import { entityLabel } from "@/engine/world";
import { loadPacks, toPackOption } from "@/lib/summaries";
import { toSummary } from "@/runner/store";
import { RunView } from "@/ui/RunView";
import { FIXTURE_RUN } from "@/ui/fixture";

// Launcher reads ?packId=/?scenarioId= via useSearchParams(), which Next.js requires a Suspense
// boundary for on a *statically* prerendered page — force-dynamic (as every other page here does)
// sidesteps that instead, matching how `/` and `/runs/[id]` are already rendered.
export const dynamic = "force-dynamic";

export default function DevPreview() {
  const packs = loadPacks().packs.map(toPackOption);
  const pack = loadPack(FIXTURE_RUN.packId);
  return (
    <RunView
      run={FIXTURE_RUN}
      packs={packs}
      tools={pack.tools}
      principalLabel={entityLabel(pack, pack.meta.principal)}
      injectedLabel={FIXTURE_RUN.attack ? entityLabel(pack, FIXTURE_RUN.attack.mutation.collection) : ""}
      recent={[toSummary(FIXTURE_RUN, true)]}
    />
  );
}
