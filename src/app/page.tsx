import { listPackIds, loadPack } from "@/engine/pack";
import { toScenarioSummary, type ScenarioSummary } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

const scenarios = (): ScenarioSummary[] =>
  listPackIds().flatMap((id) => {
    const pack = loadPack(id);
    return pack.scenarios.map((s) => toScenarioSummary(s, pack.meta.id));
  });

export default function Home() {
  return <RunPage id={null} initialRun={null} scenarios={scenarios()} recent={listRuns()} />;
}
