import { loadPacks } from "@/lib/summaries";
import { listRuns, type RunSummary } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { RunsPage } from "@/ui/runs/RunsPage";
import { compareInsight, luresInsight, mandateInsight, runsSubline, toRunRow, type Insight } from "@/ui/runs/runsView";

export const dynamic = "force-dynamic";

type Packs = ReturnType<typeof loadPacks>["packs"];

/** A v1 record (no `packId`) still names its Scenario; the pack that owns that Scenario names the World. */
function packOf(packs: Packs, r: Pick<RunSummary, "packId" | "scenarioId">) {
  return packs.find((p) => p.meta.id === r.packId) ?? packs.find((p) => p.scenarios.some((s) => s.id === r.scenarioId));
}

/** The Policy of the most recent Run's Scenario — the "Mandate in force" card. Null with no Runs or no pack. */
function mandateInForce(packs: Packs, latest: RunSummary | undefined): string | null {
  if (!latest) return null;
  return packOf(packs, latest)?.scenarios.find((s) => s.id === latest.scenarioId)?.policy.text ?? null;
}

export default function Home() {
  const { packs } = loadPacks();
  const runs = listRuns().map((r) => (r.packName ? r : { ...r, packName: packOf(packs, r)?.meta.name ?? r.packId }));
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request; one clock reading per page keeps every row's "when" consistent
  const now = Date.now();
  const insights = [compareInsight(runs), mandateInsight(mandateInForce(packs, runs[0])), luresInsight(runs)].filter((i): i is Insight => i !== null);
  return (
    <ConsoleShell>
      <RunsPage rows={runs.map((r) => toRunRow(r, now))} subline={runsSubline(runs)} insights={insights} />
    </ConsoleShell>
  );
}
