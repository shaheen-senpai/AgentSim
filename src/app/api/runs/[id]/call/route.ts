import { z } from "zod";
import { ToolError } from "@/engine/dsl";
import { resolveToolName } from "@/runner/agentRef";
import { getLive } from "@/runner/registry";
import { loadRun } from "@/runner/store";

export const dynamic = "force-dynamic";

// `callId` and `batchId` are `nullish`, not `optional`: plenty of clients serialise an absent
// value as an explicit `null` (Python's `json.dumps` of a `None` default is the obvious one), and
// an agent that sends `"callId": null` means exactly what one that omits the key means. Rejecting
// it would fail the call on a detail of the caller's serialiser.
const Body = z.object({
  tool: z.string().min(1),
  input: z.unknown().optional(),
  callId: z.string().nullish(),
  batchId: z.string().nullish(),
});

/** Shape B: the agent runs its own loop and forwards each tool call here. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const live = getLive(id);
  if (!live) {
    return loadRun(id)
      ? Response.json({ error: `Run ${id} has finished` }, { status: 409 })
      : Response.json({ error: "Unknown run" }, { status: 404 });
  }

  const { tool, input, callId, batchId } = parsed.data;
  try {
    const result = await live.gateway.execute({
      tool: resolveToolName(live.run.agent, tool),
      input,
      toolUseId: callId ?? undefined, // a null callId is an absent one; the gateway then names the Event itself
      source: "forwarder",
      batchId,
    });
    return Response.json({ ok: true, result });
  } catch (e) {
    // A refused tool call is a normal simulation outcome — already recorded as an Event — so it
    // comes back 200 with `ok: false` rather than as an HTTP error the agent's client would throw on.
    if (e instanceof ToolError) return Response.json({ ok: false, error: e.message });
    throw e;
  }
}
