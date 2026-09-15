import { loadRun } from "@/runner/store";

export const dynamic = "force-dynamic";

/** The Task Brief as plain text, so `curl`ing it drops straight into an agent's prompt. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) return Response.json({ error: "Unknown run" }, { status: 404 });
  return new Response(run.taskBrief, { headers: { "content-type": "text/plain; charset=utf-8" } });
}
