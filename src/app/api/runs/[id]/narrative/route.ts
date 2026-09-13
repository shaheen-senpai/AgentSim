import { loadRun, saveRun } from "@/runner/store";
import { writeNarrative } from "@/runner/narrative";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run || run.status === "running") return Response.json({ error: "Run not finished" }, { status: 409 });
  if (!run.narrative) { run.narrative = await writeNarrative(run); saveRun(run); }
  return Response.json({ narrative: run.narrative });
}
