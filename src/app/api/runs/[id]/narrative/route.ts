import { isGoldenRun, loadRun, saveRun } from "@/runner/store";
import { writeNarrative } from "@/runner/narrative";

export const dynamic = "force-dynamic";

/**
 * Writes the post-Run narrative — one Opus call — and stores it on the Run.
 *
 * The two refusals below are the *server-side* copy of the rule `RunView` applies in the browser.
 * The client rule alone was not enough: it depends on the Run appearing in the `recent` array the
 * page was handed, and anything else that can POST here (a curl, a stale tab) bypassed it entirely.
 * A golden Run is the expensive case — `loadRun` falls through to `data/golden/`, so a golden id
 * would be narrated, then written by `saveRun` into `data/runs/`, which `loadRun` reads first; from
 * then on the golden id resolves to the mutated copy and "replaying makes no model calls /
 * byte-for-byte reproducible" is quietly false on that machine. Both refusals spend nothing.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run || run.status === "running") return Response.json({ error: "Run not finished" }, { status: 409 });
  if (isGoldenRun(id)) return Response.json({ error: "Golden Runs are recorded demo data — never narrated" }, { status: 409 });
  if (run.agent.kind === "byo") return Response.json({ error: "Narratives are written for Reference Agent Runs only" }, { status: 409 });
  if (!run.narrative) { run.narrative = await writeNarrative(run); saveRun(run); }
  return Response.json({ narrative: run.narrative });
}
