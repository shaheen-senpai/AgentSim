import { z } from "zod";
import { listPackIds, loadPack, packWriteErrors, parsePackFiles, savePack } from "@/engine/pack";
import { toPackSummary, type PackSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

const Body = z.object({ id: z.string(), files: z.record(z.string().min(1), z.string()) });

/** A pack hand-edited into an invalid state must not 500 the list you would use to find it. */
function summarise(id: string): PackSummary | null {
  try {
    return toPackSummary(loadPack(id));
  } catch (e) {
    console.warn(`[worlds] skipping unloadable pack ${id}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export async function GET() {
  return Response.json(listPackIds().map(summarise).filter((p): p is PackSummary => p !== null));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { id, files } = parsed.data;

  // The filesystem guards first — a bad id or a file name outside the pack layout is a 400 here
  // rather than a throw from `savePack`, which enforces the same list as the last line of defence.
  const unsafe = packWriteErrors(id, files);
  if (unsafe.length > 0) return Response.json({ errors: unsafe }, { status: 400 });
  if (listPackIds().includes(id)) return Response.json({ error: `World ${id} already exists` }, { status: 409 });

  const { pack, errors } = parsePackFiles(files);
  if (!pack) return Response.json({ errors }, { status: 400 });

  savePack(id, files);
  return Response.json(toPackSummary(pack), { status: 201 });
}
