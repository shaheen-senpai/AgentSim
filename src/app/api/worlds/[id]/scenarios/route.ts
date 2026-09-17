import { z } from "zod";
import { listPackIds, loadPack, PACK_ID_RE } from "@/engine/pack";
import { generateScenarios } from "@/generate/scenarios";

export const dynamic = "force-dynamic";
// One generation is a long Opus call with a retry; the default serverless ceiling is far too short.
export const maxDuration = 300;

const Body = z.object({ note: z.string().max(4000).optional() }).nullish();

/**
 * Generates Scenarios — Task Brief, Checks, Attacks — and the seed rows they need, for a World that
 * already exists. Stage two of building a World: the structure came from the agent's own repo, and
 * what it is tested with is written here, where a human can read it first.
 *
 * Writes nothing. Like `/api/worlds/generate`, it is POST-only and never reachable by a page load
 * or a prefetch, because it spends money; the proposal comes back for review and is saved through
 * `PUT /api/worlds/:id`.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PACK_ID_RE.test(id)) return Response.json({ error: `Invalid world id '${id}'` }, { status: 400 });
  if (!listPackIds().includes(id)) return Response.json({ error: "Unknown world" }, { status: 404 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not set, so Scenarios cannot be generated. Add it to .env and restart the server, or write one by hand on this tab." },
      { status: 503 },
    );
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  try {
    const pack = loadPack(id);
    const { files, errors, attempts } = await generateScenarios(pack.files, { note: parsed.data?.note });
    return Response.json({ files, errors, attempts });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[worlds/${id}/scenarios] ${message}`);
    return Response.json({ error: message }, { status: 502 });
  }
}
