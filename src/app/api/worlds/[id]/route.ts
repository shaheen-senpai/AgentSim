import { z } from "zod";
import { listPackIds, loadPack, PACK_ID_RE, packWriteErrors, parsePackFiles, savePack } from "@/engine/pack";
import { toPackSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

const Body = z.object({ files: z.record(z.string().min(1), z.string()) });

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // The id reaches the filesystem via `path.join`, so it is checked before anything is read.
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
  const { files } = parsed.data;

  // The filesystem guards first — every key is a path joined onto the pack directory, so one
  // outside the layout is a 400 here rather than a throw from `savePack`, which enforces the same
  // list as the last line of defence.
  const unsafe = packWriteErrors(id, files);
  if (unsafe.length > 0) return Response.json({ errors: unsafe }, { status: 400 });

  const { pack, errors } = parsePackFiles(files);
  if (!pack) return Response.json({ errors }, { status: 400 });

  savePack(id, files);
  return Response.json(toPackSummary(pack));
}
