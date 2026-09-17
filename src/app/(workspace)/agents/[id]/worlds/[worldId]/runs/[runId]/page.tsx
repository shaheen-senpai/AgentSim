// `/agents/[id]/worlds/[worldId]/runs/[runId]` — one shift, live. The console's `/runs/[id]` is
// still the deep view (parallel waves, the World diff, per-call detail); this is the one that
// answers "is anything happening", which is what a person watching a Run is actually asking.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { packForRun, withPackName } from "@/lib/runPack";
import { getAgent } from "@/runner/agentRegistry";
import { loadRun } from "@/runner/store";
import { RunLive } from "@/workspace/run/RunLive";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; worldId: string; runId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { runId } = await params;
  const run = loadRun(runId);
  return { title: run ? `${run.scenarioTitle} · AgentSim` : "Shift · AgentSim" };
}

export default async function WorkspaceRunRoute({ params }: { params: Params }) {
  const { id, worldId, runId } = await params;
  const agent = getAgent(id);
  const run = loadRun(runId);
  // The Run has to be this agent's and this World's, or the breadcrumb above it is a lie.
  if (!agent || !run || run.packId !== worldId) notFound();

  const pack = packForRun(run);
  // The Run's own agent, not the one in the URL: the bridge light has to describe what was driven.
  const ranBy = run.agent.kind === "byo" && run.agent.agentId ? getAgent(run.agent.agentId) : null;
  return (
    <RunLive
      runId={runId}
      initialRun={withPackName(run, pack)}
      agent={agent}
      runAgent={ranBy}
      world={{ id: worldId, name: pack?.meta.name ?? run.packName }}
      tools={pack?.tools ?? {}}
      systems={pack ? Object.keys(pack.meta.systems) : []}
      consoleHref={`/runs/${runId}`}
    />
  );
}
