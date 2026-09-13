import { loadRun } from "@/runner/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  return run ? Response.json(run) : Response.json({ error: "Unknown run" }, { status: 404 });
}
