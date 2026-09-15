import { z } from "zod";
import { listPackIds, loadPack, parsePackFiles, savePack } from "@/engine/pack";
import { toPackSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

// The id reaches the filesystem via `path.join`, so it is checked before anything is read or written.
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

const Body = z.object({ files: z.record(z.string().min(1), z.string()) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PACK_ID_RE.test(id)) return Response.json({ error: `Invalid world id '${id}'` }, { status: 400 });
  if (!listPackIds().includes(id)) return Response.json({ error: "Unknown world" }, { status: 404 });
  return Response.json({ pack: loadPack(id) });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PACK_ID_RE.test(id)) return Response.json({ error: `Invalid world id '${id}'` }, { status: 400 });
  if (!listPackIds().includes(id)) return Response.json({ error: "Unknown world" }, { status: 404 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const { pack, errors } = parsePackFiles(parsed.data.files);
  if (!pack) return Response.json({ errors }, { status: 400 });
  if (pack.meta.id !== id) {
    return Response.json({ errors: [{ file: "pack.yaml", path: "id", message: `Pack id '${pack.meta.id}' does not match the world id '${id}'` }] }, { status: 400 });
  }

  savePack(id, parsed.data.files);
  return Response.json(toPackSummary(pack));
}
