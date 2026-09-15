// A second MCP server, alongside /mcp/runs/[runId]: not scoped to a Run, scoped to *building* a
// World pack. A developer's own MCP client (Claude Code, or any other) connects here directly and
// hands over its agent's own tools — the "Figma plugin" pattern: the client pushes its manifest to
// us, we never scrape it. register_agent drafts a pack with Claude; get_world_draft/refine_world
// let the connecting client review and iterate in its own chat; create_world persists through the
// exact path POST /api/worlds already uses, called directly rather than re-derived.
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { POST as createWorldRoute } from "@/app/api/worlds/route";
import { createDraft, getDraft, updateDraft, type Draft } from "@/generate/draftRegistry";
import { generateWorldPack, type GenerateInput } from "@/generate/worldpack";
import { guardMcpRequest } from "@/lib/mcpAccess";
import { isValidWorldId, withPackId } from "@/ui/worlds/editorLogic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // generation is a long Opus call with a retry, same as /api/worlds/generate

const MAX_TOOLS = 200;
const ToolSchema = z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional(), inputSchema: z.unknown().optional() });

const RegisterInput = {
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  tools: z.array(ToolSchema).max(MAX_TOOLS).optional(),
  schema: z.string().max(50_000).optional(),
  openapi: z.string().max(50_000).optional(),
};
const RefineInput = { draftId: z.string().min(1), note: z.string().min(1).max(4000) };
const GetDraftInput = { draftId: z.string().min(1) };
const CreateWorldInput = { draftId: z.string().min(1), worldId: z.string().min(1) };

/** The tools array as the text `GenerateInput.tools` already accepts — no new prompt-building logic. */
function toolsToText(tools: z.infer<typeof ToolSchema>[] | undefined): string | undefined {
  if (!tools || tools.length === 0) return undefined;
  return tools.map((t) => `- ${t.name}${t.description ? `: ${t.description}` : ""}${t.inputSchema !== undefined ? `\n  input: ${JSON.stringify(t.inputSchema)}` : ""}`).join("\n");
}

function draftSummary(draft: Draft): string {
  return JSON.stringify({ draftId: draft.id, valid: draft.errors.length === 0, errorCount: draft.errors.length });
}

function renderDraft(draft: Draft): string {
  const files = Object.entries(draft.files).map(([name, body]) => `## ${name}\n\n\`\`\`yaml\n${body}\`\`\``).join("\n\n");
  const errors = draft.errors.length === 0 ? "Valid — no outstanding errors." : draft.errors.map((e) => `- ${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`).join("\n");
  return [`# World draft ${draft.id}`, "", files, "", "## Validation", "", errors].join("\n");
}

const text = (body: string, isError = false) => ({ content: [{ type: "text" as const, text: body }], isError });

const handler = createMcpHandler(
  () => {
    const server = new McpServer(
      { name: "agentsim-worldbuilder", version: "0.1.0" },
      {
        instructions:
          "Builds a simulated test World for an agent, from its own tools — you are running inside that agent's own repo, so gather this " +
          "yourself rather than asking the user for it: read the agent's tool definitions, its database schema or ORM models, and any " +
          "OpenAPI spec directly from the codebase. Then call register_agent with the agent's real tool list (name/description/inputSchema, " +
          "the same shape as tools/list), the schema text and the OpenAPI text if the repo has them, plus a short description of what the " +
          "agent does — this drafts a World pack with Claude. Then get_world_draft to read it, refine_world with a plain-language change, " +
          "and create_world once it looks right.",
      },
    );

    server.registerTool(
      "register_agent",
      { description: "Registers an agent and its tools, and drafts a World pack for testing it.", inputSchema: RegisterInput },
      async (args) => {
        if (!process.env.ANTHROPIC_API_KEY) return text("ANTHROPIC_API_KEY is not set on the AgentSim server, so a World cannot be drafted.", true);
        const input: GenerateInput = { name: args.name, domain: args.domain, description: args.description, schema: args.schema, tools: toolsToText(args.tools), openapi: args.openapi };
        const result = await generateWorldPack(input);
        return text(draftSummary(createDraft(input, result)));
      },
    );

    server.registerTool(
      "refine_world",
      { description: "Regenerates a draft with a plain-language change, keeping everything the change does not touch.", inputSchema: RefineInput },
      async (args) => {
        if (!process.env.ANTHROPIC_API_KEY) return text("ANTHROPIC_API_KEY is not set on the AgentSim server, so a World cannot be drafted.", true);
        const draft = getDraft(args.draftId);
        if (!draft) return text(`Unknown draft ${args.draftId}`, true);
        const result = await generateWorldPack(draft.input, undefined, { note: args.note, previousFiles: draft.files });
        return text(draftSummary(updateDraft(draft.id, result)!));
      },
    );

    server.registerTool(
      "get_world_draft",
      { description: "Returns a draft's current files and outstanding validation errors.", inputSchema: GetDraftInput },
      async (args) => {
        const draft = getDraft(args.draftId);
        return draft ? text(renderDraft(draft)) : text(`Unknown draft ${args.draftId}`, true);
      },
    );

    server.registerTool(
      "create_world",
      { description: "Persists a draft as a World, at worldId. Fails if the draft still has validation errors.", inputSchema: CreateWorldInput },
      async (args) => {
        const draft = getDraft(args.draftId);
        if (!draft) return text(`Unknown draft ${args.draftId}`, true);
        if (!isValidWorldId(args.worldId)) return text("worldId must be 2-41 characters: lowercase letters, digits and hyphens, starting with a letter or digit.", true);

        const files = { ...draft.files, "pack.yaml": withPackId(draft.files["pack.yaml"] ?? "", args.worldId) };
        const res = await createWorldRoute(
          new Request("http://internal/api/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: args.worldId, files }) }),
        );
        const data = (await res.json()) as { error?: string; errors?: unknown[] };
        return res.ok ? text(JSON.stringify({ worldId: args.worldId, url: `/worlds/${args.worldId}` })) : text(JSON.stringify(data), true);
      },
    );

    return server;
  },
  { onerror: (e) => console.error("[mcp/worlds]", e) },
);

async function serve(request: Request): Promise<Response> {
  const rejected = guardMcpRequest(request);
  if (rejected) return rejected;
  return handler.fetch(request);
}

export const POST = serve;
export const GET = serve;
export const DELETE = serve;
