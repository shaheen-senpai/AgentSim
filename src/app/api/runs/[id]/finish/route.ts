import { finishRun } from "@/runner/run";

export const dynamic = "force-dynamic";

/** Someone pressed "Finish & evaluate" — as opposed to the agent, the idle timer or an error. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return Response.json(finishRun(id, { finishedBy: "user" }));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}
