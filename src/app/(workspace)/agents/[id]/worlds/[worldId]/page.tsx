// `/agents/[id]/worlds/[worldId]` — one of an agent's Worlds: an installed pack it is attached to,
// or a World drafted for it. Both render through the same view model (`workspace/worldDetail`).
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE } from "@/engine/pack";
import { getAgent } from "@/runner/agentRegistry";
import { parseTab } from "@/ui/worlds/packView";
import { WorldPage } from "@/workspace/WorldPage";
import { draftDetailView, packDetailView, type WorldDetailView } from "@/workspace/worldDetail";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; worldId: string }>;

function resolve(agentId: string, worldId: string): { agent: { id: string; name: string }; view: WorldDetailView } | null {
  const agent = getAgent(agentId);
  if (!agent) return null;
  const draft = agent.worlds.find((w) => w.id === worldId);
  if (draft) return { agent, view: draftDetailView(draft, agent) };
  // The id reaches the filesystem via `loadPack`, so it is checked first; an unattached pack is not this agent's.
  if (!agent.worldIds.includes(worldId) || !PACK_ID_RE.test(worldId) || !listPackIds().includes(worldId)) return null;
  try {
    return { agent, view: packDetailView(loadPack(worldId)) };
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, worldId } = await params;
  const r = resolve(id, worldId);
  return { title: r ? `${r.view.name} · ${r.agent.name} · AgentSim` : "World · AgentSim" };
}

export default async function AgentWorldRoute({ params, searchParams }: { params: Params; searchParams: Promise<{ tab?: string | string[] }> }) {
  const { id, worldId } = await params;
  const { tab } = await searchParams;
  const r = resolve(id, worldId);
  if (!r) notFound();
  return <WorldPage view={r.view} agent={r.agent} tab={parseTab(tab)} />;
}
