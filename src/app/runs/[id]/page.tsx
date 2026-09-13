import { notFound } from "next/navigation";
import { listScenarios } from "@/sim/scenario";
import { listRuns, loadRun } from "@/runner/store";
import { toScenarioSummary } from "@/lib/scenarioSummary";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  return <RunPage id={id} initialRun={run} scenarios={listScenarios().map(toScenarioSummary)} recent={listRuns()} />;
}
