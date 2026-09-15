import { createMcpHandler, McpServer, hostHeaderValidationResponse, originValidationResponse, localhostAllowedHostnames, localhostAllowedOrigins } from "@modelcontextprotocol/server";
import { ToolError } from "@/engine/dsl";
import { inputZod } from "@/engine/pack";
import { aliasByTool } from "@/runner/agentRef";
import { getLive } from "@/runner/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const runIdFromUrl = (url: string) => new URL(url).pathname.split("/").filter(Boolean).pop() ?? "";

const handler = createMcpHandler(
  ({ requestInfo }) => {
    const runId = runIdFromUrl(requestInfo!.url);
    const live = getLive(runId);
    if (!live) throw new Error(`Unknown run ${runId}`);
    // `instructions` reaches the client in the initialize result, so an MCP agent gets the Task
    // Brief without a separate fetch. (`ServerOptions.instructions`, @modelcontextprotocol/server 2.)
    const server = new McpServer({ name: "agentsim", version: "0.2.0" }, { instructions: live.run.taskBrief });
    const alias = aliasByTool(live.run.agent);
    for (const def of Object.values(live.pack.tools)) {
      server.registerTool(
        alias.get(def.name) ?? def.name,
        { description: def.description, inputSchema: inputZod(def).shape, annotations: { readOnlyHint: def.kind === "read" } },
        async (args) => {
          try {
            return { content: [{ type: "text" as const, text: await live.gateway.execute({ tool: def.name, input: args, source: "mcp" }) }] };
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

/**
 * Extra hostnames this endpoint will answer on, from `AGENTSIM_ALLOWED_HOSTS` (comma-separated,
 * no scheme, no port). Unset — the default — leaves the localhost-only allowlist exactly as it was.
 *
 * The allowlist is DNS-rebinding protection: it is what makes a page on some other origin unable to
 * drive a Run through the browser of whoever is running AgentSim. Naming a host here disables that
 * protection *for that host*, which is the price of letting an agent that is not on this machine —
 * behind a tunnel, or on a LAN address — reach the Run at all. Read at request time, so it is an
 * environment variable and not a build-time constant.
 */
function extraAllowedHosts(): string[] {
  return (process.env.AGENTSIM_ALLOWED_HOSTS ?? "").split(",").map((h) => h.trim()).filter((h) => h.length > 0);
}

async function serve(request: Request): Promise<Response> {
  const extra = extraAllowedHosts();
  const rejected =
    hostHeaderValidationResponse(request, [...localhostAllowedHostnames(), ...extra]) ??
    originValidationResponse(request, [...localhostAllowedOrigins(), ...extra]);
  if (rejected) return rejected;
  if (!getLive(runIdFromUrl(request.url))) return Response.json({ jsonrpc: "2.0", error: { code: -32600, message: "Unknown run" }, id: null }, { status: 404 });
  return handler.fetch(request);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
