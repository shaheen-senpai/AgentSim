// `/runs/[id]/compare` — one Run's three World ledgers (Seed, start, end) compared field by field,
// on a page of its own so the tables have the whole width. The Run page's World diff card links here.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { seedWorld } from "@/engine/world";
import { packForRun, withPackName } from "@/lib/runPack";
import { getAgent } from "@/runner/agentRegistry";
import { loadRun } from "@/runner/store";
import { LedgerComparePage } from "@/workspace/run/LedgerCompare";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ mode?: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const run = loadRun(id);
  return { title: run ? `Compare ledgers · ${run.scenarioTitle} · AgentSim` : "Compare ledgers · AgentSim" };
}

export default async function CompareRoute({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const { mode } = await searchParams;
  const run = loadRun(id);
  if (!run) notFound();
  const pack = packForRun(run);
  const registered = run.agent.kind === "byo" && run.agent.agentId ? getAgent(run.agent.agentId) : null;
  return (
    <LedgerComparePage
      run={withPackName(run, pack)}
      // The Seed is not on the record — the start Snapshot is taken after the Attack — so it is
      // rebuilt here with the same `seedWorld` a Run calls, giving the comparison its third ledger.
      seedSnapshot={pack ? seedWorld(pack) : null}
      entities={pack ? Object.entries(pack.meta.entities).map(([name, spec]) => ({ name, label: spec.label })) : []}
      agent={registered ? { id: registered.id, name: registered.name } : null}
      initialMode={mode ?? null}
    />
  );
}
