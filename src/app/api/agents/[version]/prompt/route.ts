import { AGENT_VERSIONS, loadSystemPrompt, type AgentVersion } from "@/runner/agents";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  if (!AGENT_VERSIONS.includes(version as AgentVersion)) return Response.json({ error: "Unknown agent version" }, { status: 404 });
  return Response.json({ version, prompt: loadSystemPrompt(version as AgentVersion) });
}
