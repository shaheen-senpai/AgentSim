import { listPackIds, loadPack } from "@/engine/pack";
import { loadSystemPrompt, referenceVersions } from "@/runner/agents";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ version: string }> }) {
  const { version } = await params;
  const packId = new URL(req.url).searchParams.get("packId") ?? listPackIds()[0];
  if (!packId) return Response.json({ error: "No World packs installed" }, { status: 404 });
  const pack = loadPack(packId);
  if (!referenceVersions(pack).includes(version)) return Response.json({ error: "Unknown agent version" }, { status: 404 });
  return Response.json({ packId, version, prompt: loadSystemPrompt(pack, version) });
}
