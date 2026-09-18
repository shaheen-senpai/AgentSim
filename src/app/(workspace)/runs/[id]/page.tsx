// `/runs/[id]` — one Run, in the workspace theme. The console's Runs list and `POST /api/runs`
// still link here, so the URL is unchanged; only the page around it moved.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { entityLabel } from "@/engine/world";
import { packForRun, withPackName } from "@/lib/runPack";
import { getAgent } from "@/runner/agentRegistry";
import { isGoldenRun, loadRun } from "@/runner/store";
import { RunPage } from "@/workspace/run/RunPage";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const run = loadRun(id);
  return { title: run ? `${run.scenarioTitle} · AgentSim` : "Run · AgentSim" };
}

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  // What the page needs from the Run's own pack: tools (per-Event formatting, read/write), Systems
  // (stable colours), the principal's label (the diff's reads counter) and the label of the
  // collection the Attack injected into (a Violation's "Source:" line). All empty when the pack is
  // gone — a Run whose pack was deleted still renders.
  const pack = packForRun(run);
  const injectedCollection = run.attack?.mutation.collection;
  // A BYO Run names its registry agent; the header walks back to that agent's page while it exists.
  const registered = run.agent.kind === "byo" && run.agent.agentId ? getAgent(run.agent.agentId) : null;
  return (
    <RunPage
      id={id}
      initialRun={withPackName(run, pack)}
      agent={registered ? { id: registered.id, name: registered.name } : null}
      tools={pack?.tools ?? {}}
      systems={pack ? Object.keys(pack.meta.systems).sort() : []}
      principalLabel={pack ? entityLabel(pack, pack.meta.principal) : ""}
      injectedLabel={pack && injectedCollection ? entityLabel(pack, injectedCollection) : ""}
      golden={isGoldenRun(id)}
      hasSeed={pack !== null}
    />
  );
}
