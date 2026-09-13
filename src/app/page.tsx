import { listScenarios } from "@/sim/scenario";
import { listRuns } from "@/runner/store";
import { toScenarioSummary } from "@/lib/scenarioSummary";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

export default function Home() {
  return <RunPage id={null} initialRun={null} scenarios={listScenarios().map(toScenarioSummary)} recent={listRuns()} />;
}
