import { listPackIds, loadPack } from "@/engine/pack";
import { loadSystemPrompt, referenceVersions } from "@/runner/agents";

export const dynamic = "force-dynamic";

// Segment named `id` (not `version`) to match the sibling `[id]/route.ts` (agents registry CRUD) —
// Next.js requires one dynamic-segment name per path position across the whole route tree.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: version } = await params;
  const packId = new URL(req.url).searchParams.get("packId") ?? listPackIds()[0];
  if (!packId) return Response.json({ error: "No World packs installed" }, { status: 404 });
  const pack = loadPack(packId);
  if (!referenceVersions(pack).includes(version)) return Response.json({ error: "Unknown agent version" }, { status: 404 });
  return Response.json({ packId, version, prompt: loadSystemPrompt(pack, version) });
}
