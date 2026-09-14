import { listPackIds, loadPack } from "@/engine/pack";

export const dynamic = "force-dynamic";

/** Scenario summaries for the Launcher. Task 9 adds the `packId` filter and pack-scoped shape. */
export async function GET(req: Request) {
  const only = new URL(req.url).searchParams.get("packId");
  const packIds = only ? [only] : listPackIds();
  const summaries = packIds.flatMap((id) =>
    loadPack(id).scenarios.map((s) => ({ id: s.id, title: s.title, attacks: s.attacks.map((a) => ({ id: a.id, title: a.title })) })),
  );
  return Response.json(summaries);
}
