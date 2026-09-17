// `/agents` — the signed-in landing page. A Server Component: it reads the agent registry and the
// run summaries off disk and hands the client island plain props; everything after goes over the API.
import type { Metadata } from "next";
import { listAgents } from "@/runner/agentRegistry";
import { listRuns } from "@/runner/store";
import { AgentsPage } from "@/workspace/AgentsPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Agents · AgentSim" };

export default function AgentsRoute() {
  return <AgentsPage initialAgents={listAgents()} runs={listRuns()} />;
}
