// `/agents/[id]/worlds/[worldId]/run` — start a shift against this World. The Launcher is the only
// place the agent's endpoint is asked for, so a World that was imported by the plugin (and arrives
// with no way in at all) becomes runnable here rather than on a separate Connect page.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPack, PACK_ID_RE } from "@/engine/pack";
import { getAgent } from "@/runner/agentRegistry";
import { RunLauncher, type LaunchScenario } from "@/workspace/run/RunLauncher";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; worldId: string }>;

/** Only a pack on disk that this agent is attached to can be run; a drafted World is not one yet. */
function resolve(agentId: string, worldId: string) {
  const agent = getAgent(agentId);
  if (!agent || !agent.worldIds.includes(worldId) || !PACK_ID_RE.test(worldId)) return null;
  try {
    return { agent, pack: loadPack(worldId) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, worldId } = await params;
  const r = resolve(id, worldId);
  return { title: r ? `Run a shift · ${r.pack.meta.name} · AgentSim` : "Run a shift · AgentSim" };
}

export default async function RunLauncherRoute({ params, searchParams }: { params: Params; searchParams: Promise<{ scenario?: string | string[] }> }) {
  const { id, worldId } = await params;
  const { scenario } = await searchParams;
  const r = resolve(id, worldId);
  if (!r) notFound();

  const scenarios: LaunchScenario[] = r.pack.scenarios.map((s) => ({
    id: s.id,
    title: s.title,
    taskBrief: s.task_brief,
    attacks: s.attacks.map((a) => ({ id: a.id, title: a.title })),
  }));
  const wanted = Array.isArray(scenario) ? scenario[0] : scenario;

  return (
    <RunLauncher
      agent={r.agent}
      world={{ id: r.pack.meta.id, name: r.pack.meta.name }}
      scenarios={scenarios}
      runnable={r.pack.meta.status !== "draft"}
      initialScenarioId={scenarios.some((s) => s.id === wanted) ? (wanted ?? null) : null}
    />
  );
}
