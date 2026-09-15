import { AgentInputSchema, deleteAgent, getAgent, saveAgent } from "@/runner/agentRegistry";

export const dynamic = "force-dynamic";

// `id` here is a registry id (`agt_…`); the Reference Agent prompt route one segment deeper
// (`/api/agents/[version]/prompt`) is a different, more specific path and resolves separately.
const Body = AgentInputSchema.omit({ id: true });

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  if (!getAgent(id)) return Response.json({ error: "Unknown agent" }, { status: 404 });
  return Response.json(saveAgent({ ...parsed.data, id }));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return deleteAgent(id) ? Response.json({ ok: true }) : Response.json({ error: "Unknown agent" }, { status: 404 });
}
