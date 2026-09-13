import { createMcpHandler, McpServer, hostHeaderValidationResponse, originValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins } from "@modelcontextprotocol/server";
import { getLive } from "@/runner/registry";
import { TOOLS, ToolError } from "@/sim/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runIdFromUrl = (url: string) => new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const runId = runIdFromUrl(requestInfo!.url);
    const live = getLive(runId);
    if (!live) throw new Error(`Unknown run ${runId}`);
    const server = new McpServer({ name: "agentsim", version: "0.1.0" });
    for (const def of TOOLS) {
      server.registerTool(
        def.name,
        { description: def.description, inputSchema: def.schema, annotations: { readOnlyHint: def.kind === "read" } },
        async (args) => {
          try {
            return { content: [{ type: "text" as const, text: await live.sim.execute(def.name, args) }] };
          } catch (e) {
            if (e instanceof ToolError) return { content: [{ type: "text" as const, text: e.message }], isError: true };
            throw e;
          }
        },
      );
    }
    return server;
  },
  { onerror: (e) => console.error("[mcp]", e) },
);

async function serve(request: Request): Promise<Response> {
  const rejected = hostHeaderValidationResponse(request, localhostAllowedHostnames()) ?? originValidationResponse(request, localhostAllowedOrigins());
  if (rejected) return rejected;
  if (!getLive(runIdFromUrl(request.url))) return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Unknown run" }, id: null }, { status: 404 });
  return handler.fetch(request);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
