import { listPackIds, loadPack } from "@/engine/pack";
import { listRuns } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";
import type { ScenarioSummary } from "@/ui/types";

export const dynamic = "force-dynamic";

// Task 9 replaces this with GET /api/scenarios?packId= and a pack-aware Launcher.
const scenarios = (): ScenarioSummary[] =>
  listPackIds().flatMap((id) => loadPack(id).scenarios.map((s) => ({ id: s.id, title: s.title, attacks: s.attacks.map((a) => ({ id: a.id, title: a.title })) })));

export default function Home() {
  return <RunPage id={null} initialRun={null} scenarios={scenarios()} recent={listRuns()} />;
}
