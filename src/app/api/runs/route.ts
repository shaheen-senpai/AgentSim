import { z } from "zod";
import { listPackIds, loadPack } from "@/engine/pack";
import { startRun } from "@/runner/run";
import { listRuns } from "@/runner/store";

export const dynamic = "force-dynamic";

// Task 9 replaces this with the v2 body (pack, agent ref, idle timeout) and the richer response.
const Body = z.object({
  packId: z.string().optional(),
  scenarioId: z.string(),
  agent: z.enum(["naive", "fixed", "generic", "byo"]),
  attackId: z.string().nullable().optional(),
  idleTimeoutMs: z.number().nullable().optional(),
});

/** Until the UI sends a pack, find the one that owns the Scenario. */
function resolvePackId(scenarioId: string, given?: string): string {
  if (given) return given;
  const owner = listPackIds().find((id) => loadPack(id).scenarios.some((s) => s.id === scenarioId));
  if (!owner) throw new Error(`No World pack contains scenario ${scenarioId}`);
  return owner;
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { scenarioId, agent, attackId, idleTimeoutMs } = parsed.data;
  try {
    const id = startRun({
      packId: resolvePackId(scenarioId, parsed.data.packId),
      scenarioId,
      attackId: attackId ?? null,
      agent: agent === "byo" ? { kind: "byo" } : { kind: "reference", version: agent },
      ...(idleTimeoutMs === undefined ? {} : { idleTimeoutMs }),
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const scenarioId = new URL(req.url).searchParams.get("scenarioId") ?? undefined;
  return Response.json(listRuns(scenarioId));
}
