import { listPackIds } from "@/engine/pack";
import { loadPacks, toScenarioSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

/**
 * Scenario summaries for the Launcher: one pack's when `?packId=` is given, otherwise every pack's.
 *
 * `loadPacks` skips a pack that no longer loads, so one hand-broken pack cannot 500 the Launcher —
 * an installed-but-unloadable pack simply contributes no Scenarios (`/worlds/:id` reports why).
 */
export async function GET(req: Request) {
  const only = new URL(req.url).searchParams.get("packId");
  if (only && !listPackIds().includes(only)) return Response.json({ error: `Unknown world ${only}` }, { status: 404 });

  const summaries = loadPacks()
    .packs.filter((pack) => only === null || pack.meta.id === only)
    .flatMap((pack) => pack.scenarios.map((s) => toScenarioSummary(s, pack.meta.id)));
  return Response.json(summaries);
}
