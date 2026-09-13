import { z } from "zod";
import { startRun } from "@/runner/run";
import { listRuns } from "@/runner/store";

export const dynamic = "force-dynamic";

const Body = z.object({ scenarioId: z.string(), agent: z.enum(["naive", "fixed", "byo"]), attackId: z.string().nullable().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  try {
    const id = startRun({ scenarioId: parsed.data.scenarioId, agent: parsed.data.agent, attackId: parsed.data.attackId ?? null });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function GET(req: Request) {
  const scenarioId = new URL(req.url).searchParams.get("scenarioId") ?? undefined;
  return Response.json(listRuns(scenarioId));
}
