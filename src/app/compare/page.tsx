import Link from "next/link";
import { notFound } from "next/navigation";
import type { Check } from "@/engine/pack";
import { packForRun, withPackName } from "@/lib/runPack";
import { listRuns, loadRun } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { ActionLedger } from "@/ui/compare/ActionLedger";
import { AttackPanel } from "@/ui/compare/AttackPanel";
import { ChecksTable } from "@/ui/compare/ChecksTable";
import { CompareCards } from "@/ui/compare/CompareCards";
import { latestComparablePair } from "@/ui/compare/latestComparablePair";
import { RunPicker } from "@/ui/compare/RunPicker";
import { WorldDiffCompare } from "@/ui/compare/WorldDiffCompare";

export const dynamic = "force-dynamic";

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <ConsoleShell>
      <section id="view-compare">
        <Link className="back-link" href="/runs">← Runs</Link>
        <div className="crumb">AgentSim</div>
        <h1 className="page serif">Compare runs</h1>
        <p className="sub">Two Runs of the same Scenario, step by step: what each agent called, what came back, where the Attack’s text entered, and which Checks each one failed.</p>
        {children}
      </section>
    </ConsoleShell>
  );
}

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const runs = listRuns();
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request; one clock reading keeps every picker label consistent
  const now = Date.now();

  let aId = a, bId = b;
  // Fall back to the latest comparable pair only when neither param was given (landing on /compare).
  // `RunPicker` navigates to `?a=<id>&b=` when the newly picked Run A has no peer; that choice stands.
  if (!aId && !bId) {
    const pair = latestComparablePair(runs);
    if (pair) {
      aId = pair.a.id;
      bId = pair.b.id;
    }
  }

  if (!aId || !bId) {
    return (
      <Frame>
        <RunPicker runs={runs} a={aId ?? runs.find((r) => r.status === "completed")?.id ?? ""} b={bId ?? ""} now={now} />
      </Frame>
    );
  }

  const loadedA = loadRun(aId), loadedB = loadRun(bId);
  if (!loadedA || !loadedB) notFound();
  const packA = packForRun(loadedA), packB = packForRun(loadedB);
  const ra = withPackName(loadedA, packA), rb = withPackName(loadedB, packB);

  // Same pack *and* same Scenario — two packs can share a `scenarioId` string with different Checks.
  const sameScenario = ra.scenarioId === rb.scenarioId && (ra.packId ?? packA?.meta.id) === (rb.packId ?? packB?.meta.id);
  let sharedChecks: Check[] = sameScenario ? (packA?.scenarios.find((s) => s.id === ra.scenarioId)?.checks ?? []) : [];
  // `lure_not_taken` is synthesised at evaluation time (`lureCheck`) and never authored on a Scenario,
  // so it is added here whenever either Run was attacked — shaped exactly like `lureCheck`'s
  // Violation so `compareLedger`'s keys match with no special case.
  if (ra.attack || rb.attack) {
    const attack = ra.attack ?? rb.attack!;
    sharedChecks = [...sharedChecks, { type: "lure_not_taken", dimension: "safety", attack: attack.id, lure: attack.lure } as unknown as Check];
  }

  return (
    <Frame>
      <RunPicker runs={runs} a={ra.id} b={rb.id} now={now} />
      <div id="cmpBody">
        <CompareCards runA={ra} runB={rb} />
        <AttackPanel runA={ra} runB={rb} />
        <ActionLedger runA={ra} runB={rb} />
        {sharedChecks.length > 0 && <ChecksTable checks={sharedChecks} violationsA={ra.violations} violationsB={rb.violations} scoreA={ra.score} scoreB={rb.score} />}
        <WorldDiffCompare runA={ra} runB={rb} />
      </div>
    </Frame>
  );
}
