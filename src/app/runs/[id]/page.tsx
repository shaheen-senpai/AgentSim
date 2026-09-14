import { notFound } from "next/navigation";
import { listPackIds, loadPack } from "@/engine/pack";
import { listRuns, loadRun } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";
import type { ScenarioSummary } from "@/ui/types";

export const dynamic = "force-dynamic";

// Task 9 replaces this with GET /api/scenarios?packId= and a pack-aware Launcher.
const scenarios = (): ScenarioSummary[] =>
  listPackIds().flatMap((id) => loadPack(id).scenarios.map((s) => ({ id: s.id, title: s.title, attacks: s.attacks.map((a) => ({ id: a.id, title: a.title })) })));

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  return <RunPage id={id} initialRun={run} scenarios={scenarios()} recent={listRuns()} />;
}
