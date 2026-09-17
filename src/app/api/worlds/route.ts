import { z } from "zod";
import { listPackIds, packWriteErrors, parsePackFiles, savePack, type BuildInfo } from "@/engine/pack";
import { loadPacks, toPackSummary } from "@/lib/summaries";
import { withBuiltBy, withPackStatus } from "@/ui/worlds/packEdits";

export const dynamic = "force-dynamic";

const BuiltBySchema = z.object({
  source: z.enum(["plugin", "console"]),
  run: z.string().optional(),
  token: z.string().optional(),
  client: z.string().optional(),
  repo: z.string().optional(),
});

const Body = z.object({
  id: z.string(),
  files: z.record(z.string().min(1), z.string()),
  /** Who built it. The `at` stamp is the server's, never the caller's. */
  builtBy: BuiltBySchema.optional(),
});

/** A pack hand-edited into an invalid state must not 500 the list you would use to find it. */
export async function GET() {
  return Response.json(loadPacks().packs.map(toPackSummary));
}

/** `pack.yaml` marked draft and stamped with its build; unparseable YAML is left for `parsePackFiles` to report. */
function asDraft(files: Record<string, string>, builtBy: BuildInfo): Record<string, string> {
  const packYaml = files["pack.yaml"];
  if (packYaml === undefined) return files;
  try {
    return { ...files, "pack.yaml": withBuiltBy(withPackStatus(packYaml, "draft"), builtBy) };
  } catch {
    return files;
  }
}

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
  const { id, builtBy } = parsed.data;

  // Every World is created as a draft, and this is the one place every create routes through — the
  // plugin, the composer and a pack copy alike — so no caller can forget it and hand out something
  // runnable that nobody reviewed. Publishing is a `PUT` with `status: ready`, which the engine
  // refuses while the World has no Scenarios.
  const files = asDraft(parsed.data.files, { source: builtBy?.source ?? "console", ...builtBy, at: new Date().toISOString() });

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
