import { z } from "zod";
import { deletePack, listPackIds, loadPack, PACK_ID_RE, packWriteErrors, parsePackFiles, savePack } from "@/engine/pack";
import { rotateToken } from "@/generate/buildTokens";
import { toPackSummary } from "@/lib/summaries";
import { listRuns } from "@/runner/store";

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

  // Publishing ends the life of the build token that made this World: the plugin may keep writing
  // over a draft for as long as the review takes, and not one byte after it goes live. Rotating
  // here rather than expiring silently means the operator leaves with the successor in hand.
  // Idempotent — re-saving a World that is already `ready` mints nothing.
  const built = pack.meta.status !== "draft" ? pack.meta.built_by?.token : undefined;
  const rotated = built ? rotateToken(built) : null;

  return Response.json({ ...toPackSummary(pack), ...(rotated ? { rotatedToken: rotated.token, rotatedTokenExpiresAt: rotated.expiresAt } : {}) });
}

/**
 * Discards a World. Only ever a draft one, and only while no Run points at it: a published World is
 * something other people's Runs and comparisons are written against, and a Run whose World has
 * gone cannot be re-scored or re-read.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!PACK_ID_RE.test(id)) return Response.json({ error: `Invalid world id '${id}'` }, { status: 400 });
  if (!listPackIds().includes(id)) return Response.json({ error: "Unknown world" }, { status: 404 });

  const pack = loadPack(id);
  if (pack.meta.status !== "draft") {
    return Response.json({ error: `World ${id} is published — only a draft World can be discarded.` }, { status: 409 });
  }
  const runs = listRuns().filter((r) => r.packId === id).length;
  if (runs > 0) {
    return Response.json({ error: `World ${id} has ${runs} Run${runs === 1 ? "" : "s"} against it, so it cannot be discarded.` }, { status: 409 });
  }

  deletePack(id);
  return Response.json({ id, deleted: true });
}
