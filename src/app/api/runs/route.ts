import { z } from "zod";
import { loadPack } from "@/engine/pack";
import { runUrls } from "@/lib/runUrls";
import { getAgent } from "@/runner/agentRegistry";
import { startRun, type CreateRunOptions } from "@/runner/run";
import { listRuns, loadRun } from "@/runner/store";

export const dynamic = "force-dynamic";

const Body = z.object({
  packId: z.string().min(1),
  scenarioId: z.string().min(1),
  attackId: z.string().nullish(),
  agent: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("reference"), version: z.string().min(1) }),
    z.object({ kind: z.literal("byo"), agentId: z.string().nullish() }),
  ]),
  idleTimeoutMs: z.number().nullish(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { packId, scenarioId, attackId, agent, idleTimeoutMs } = parsed.data;

  // A registered agent contributes its display name, shape and aliases; the Run keeps a copy, so
  // later edits to the registry never rewrite a finished Run's history.
  let ref: CreateRunOptions["agent"] = agent;
  if (agent.kind === "byo" && agent.agentId) {
    const registered = getAgent(agent.agentId);
    if (!registered) return Response.json({ error: `Unknown agent ${agent.agentId}` }, { status: 404 });
    ref = { kind: "byo", agentId: registered.id, name: registered.name, shape: registered.shape, toolAliases: registered.toolAliases };
  }

  try {
    const id = startRun({
      packId,
      scenarioId,
      attackId: attackId ?? null,
      agent: ref,
      ...(idleTimeoutMs === undefined ? {} : { idleTimeoutMs }),
    });
    // One MCP endpoint per source, so the caller can point each entry of its existing per-provider
    // MCP config at ours; `startRun` already proved the pack loads.
    const sourceIds = Object.keys(loadPack(packId).meta.systems);
    return Response.json({ id, ...runUrls(req, id, sourceIds), taskBrief: loadRun(id)?.taskBrief ?? "" }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const scenarioId = new URL(req.url).searchParams.get("scenarioId") ?? undefined;
  return Response.json(listRuns(scenarioId));
}
