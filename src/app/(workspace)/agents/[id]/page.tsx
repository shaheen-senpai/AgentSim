// `/agents/[id]` — one agent and its Worlds. Reads the registry, the installed packs and the run
// summaries on the server; attaching a World goes through PUT /api/agents/[id].
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { loadPacks, toPackSummary } from "@/lib/summaries";
import { getAgent } from "@/runner/agentRegistry";
import { listRuns } from "@/runner/store";
import { AgentDetail } from "@/workspace/AgentDetail";
import { agentTrust } from "@/workspace/agentStats";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const agent = getAgent(id);
  return { title: agent ? `${agent.name} · AgentSim` : "Agent · AgentSim" };
}

export default async function AgentRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fresh?: string | string[] }> }) {
  const { id } = await params;
  const { fresh } = await searchParams;
  const agent = getAgent(id);
  if (!agent) notFound();
  const runs = listRuns();
  const { trust, runs: runCount } = agentTrust(agent.id, runs);
  // A pack hand-edited into an invalid state is skipped here; `/worlds` reports it. Draft packs are
  // listed (a plugin-built World starts as one) and say so on their card; `POST /api/runs` refuses
  // them until they are published.
  const packs = loadPacks().packs.map(toPackSummary);
  return <AgentDetail agent={agent} packs={packs} trust={trust} runs={runCount} freshId={Array.isArray(fresh) ? fresh[0] : fresh ?? null} />;
}
