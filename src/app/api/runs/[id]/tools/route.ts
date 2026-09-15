import { inputJsonSchema, loadPack } from "@/engine/pack";
import { aliasByTool } from "@/runner/agentRef";
import { loadRun } from "@/runner/store";

export const dynamic = "force-dynamic";

/** The Run's tool catalogue, published under the names its agent knows them by. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) return Response.json({ error: "Unknown run" }, { status: 404 });

  const alias = aliasByTool(run.agent);
  const tools = Object.values(loadPack(run.packId).tools).map((def) => ({
    name: alias.get(def.name) ?? def.name,
    description: def.description,
    kind: def.kind,
    inputSchema: inputJsonSchema(def),
  }));
  return Response.json(tools);
}
