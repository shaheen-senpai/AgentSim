import { listPackIds, loadPack } from "@/engine/pack";
import { toScenarioSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

/** Scenario summaries for the Launcher: one pack's when `?packId=` is given, otherwise every pack's. */
export async function GET(req: Request) {
  const only = new URL(req.url).searchParams.get("packId");
  const installed = listPackIds();
  if (only && !installed.includes(only)) return Response.json({ error: `Unknown world ${only}` }, { status: 404 });

  const summaries = (only ? [only] : installed).flatMap((id) => {
    const pack = loadPack(id);
    return pack.scenarios.map((s) => toScenarioSummary(s, pack.meta.id));
  });
  return Response.json(summaries);
}
