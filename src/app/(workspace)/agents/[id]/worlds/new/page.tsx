// `/agents/[id]/worlds/new` — the create wizard, aimed at a World for one agent.
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { listProviders } from "@/lib/providers";
import { listPackIds } from "@/engine/pack";
import { loadPacks } from "@/lib/summaries";
import { getAgent } from "@/runner/agentRegistry";
import { CreateWizard } from "@/workspace/wizard/CreateWizard";
import { toPackPicks } from "@/workspace/wizard/packPicks";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  return { title: `New world · ${getAgent(id)?.name ?? "Agent"} · AgentSim` };
}

export default async function NewWorldForAgentRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = getAgent(id);
  if (!agent) notFound();
  return <CreateWizard target="world" agent={agent} providers={listProviders()} packs={toPackPicks(loadPacks().packs)} takenWorldIds={listPackIds()} />;
}
