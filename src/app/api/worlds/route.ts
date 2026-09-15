import { z } from "zod";
import { listPackIds, loadPack, parsePackFiles, savePack } from "@/engine/pack";
import { toPackSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "A world id is lowercase letters, digits and hyphens"),
  files: z.record(z.string().min(1), z.string()),
});

export async function GET() {
  return Response.json(listPackIds().map((id) => toPackSummary(loadPack(id))));
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { id, files } = parsed.data;
  if (listPackIds().includes(id)) return Response.json({ error: `World ${id} already exists` }, { status: 409 });

  const { pack, errors } = parsePackFiles(files);
  if (!pack) return Response.json({ errors }, { status: 400 });
  // The directory name is the id every URL uses; a pack.yaml that disagrees would make
  // `GET /api/worlds` and `GET /api/worlds/:id` describe the same pack under two names.
  if (pack.meta.id !== id) {
    return Response.json({ errors: [{ file: "pack.yaml", path: "id", message: `Pack id '${pack.meta.id}' does not match the world id '${id}'` }] }, { status: 400 });
  }

  savePack(id, files);
  return Response.json(toPackSummary(pack), { status: 201 });
}
