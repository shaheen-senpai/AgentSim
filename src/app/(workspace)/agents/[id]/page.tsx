// `/agents/[id]` — one agent and its Worlds. Reads the registry, the installed packs and the run
// summaries on the server; attaching a World goes through PUT /api/agents/[id].
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPacks, toPackSummary } from "@/lib/summaries";
import { getAgent } from "@/runner/agentRegistry";
import { listRuns } from "@/runner/store";
import { AgentDetail } from "@/workspace/AgentDetail";
import { agentTrust, trustDimensions } from "@/workspace/agentStats";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const agent = getAgent(id);
  return { title: agent ? `${agent.name} · AgentSim` : "Agent · AgentSim" };
}

export default async function AgentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();
  const runs = listRuns();
  const { trust, runs: runCount } = agentTrust(agent.id, runs);
  // A pack hand-edited into an invalid state is skipped here; `/worlds` reports it.
  const packs = loadPacks().packs.map(toPackSummary);
  return <AgentDetail agent={agent} packs={packs} trust={trust} runs={runCount} dimensions={trustDimensions(agent.id, runs)} />;
}
