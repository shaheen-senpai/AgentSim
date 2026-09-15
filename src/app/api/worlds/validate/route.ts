import { z } from "zod";
import { parsePackFiles } from "@/engine/pack";

export const dynamic = "force-dynamic";

const Body = z.object({ files: z.record(z.string().min(1), z.string()) });

/** Linting for the World editor: an invalid pack is a 200 carrying its errors, never an HTTP failure. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });

  const { pack, errors } = parsePackFiles(parsed.data.files);
  return Response.json({ ok: pack !== null, errors });
}
