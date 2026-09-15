import { AgentInputSchema, getAgent, listAgents, saveAgent } from "@/runner/agentRegistry";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(listAgents());
}

/** Registers an agent — or replaces one, 200 rather than 201, when the body carries its `id`. */
export async function POST(req: Request) {
  const parsed = AgentInputSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const replacing = parsed.data.id !== undefined && getAgent(parsed.data.id) !== null;
  return Response.json(saveAgent(parsed.data), { status: replacing ? 200 : 201 });
}
