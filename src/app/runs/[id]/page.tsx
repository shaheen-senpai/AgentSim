import { notFound } from "next/navigation";
import { listPackIds, loadPack } from "@/engine/pack";
import { toScenarioSummary, type ScenarioSummary } from "@/lib/summaries";
import { listRuns, loadRun } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

const scenarios = (): ScenarioSummary[] =>
  listPackIds().flatMap((id) => {
    const pack = loadPack(id);
    return pack.scenarios.map((s) => toScenarioSummary(s, pack.meta.id));
  });

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  return <RunPage id={id} initialRun={run} scenarios={scenarios()} recent={listRuns()} />;
}
