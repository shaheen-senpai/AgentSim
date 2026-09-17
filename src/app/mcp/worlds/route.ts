// A second MCP server, alongside /mcp/runs/[runId]: not scoped to a Run, scoped to *building* a
// World. A developer's own MCP client (Claude Code, or any other) connects here from inside their
// agent's repo and hands over what is true about that agent — the "Figma plugin" pattern: the
// client pushes its manifest to us, we never scrape it.
//
// What the plugin captures is the World's *structure*: the agent's tools, its database schema, the
// third-party MCP servers it integrates (shadowed here), and the Mandates its own policy states.
// What the World is *tested* with — seed rows, Scenarios, Attacks — is generated on the platform
// afterwards, because the plugin has no business inventing the test from inside the repo.
//
// `register_agent` spends a build token and drafts the structure; get_world_draft/refine_world let
// the connecting client review and iterate in its own chat; `create_world` persists it through the
// exact path POST /api/worlds already uses — as a **draft** World, which cannot be run until a
// human reviews it on the platform and publishes it.
import { CLIENT_INFO_META_KEY, createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { POST as createWorldRoute } from "@/app/api/worlds/route";
import { SPEND_MESSAGE, spendToken } from "@/generate/buildTokens";
import { createDraft, getDraft, updateDraft, type Draft } from "@/generate/draftRegistry";
import { generateStructure, toolsToText, type StructureInput } from "@/generate/structure";
import { listPackIds, type BuildInfo } from "@/engine/pack";
import { guardMcpRequest } from "@/lib/mcpAccess";
import { loadPacks } from "@/lib/summaries";
import { isValidWorldId, withPackId } from "@/ui/worlds/editorLogic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // generation is a long Opus call with a retry, same as /api/worlds/generate

const MAX_TOOLS = 200;
const MAX_INPUT_SCHEMA_JSON_CHARS = 5_000;
const ToolSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  inputSchema: z
    .unknown()
    .optional()
    .refine((v) => v === undefined || JSON.stringify(v).length <= MAX_INPUT_SCHEMA_JSON_CHARS, {
      message: `inputSchema is too large (max ${MAX_INPUT_SCHEMA_JSON_CHARS} characters as JSON)`,
    }),
});

const McpServerSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().max(2000).optional(),
  command: z.string().max(2000).optional(),
  tools: z.array(z.object({ name: z.string().min(1).max(200), description: z.string().max(2000).optional() })).max(MAX_TOOLS).optional(),
});

const MandateSchema = z.object({
  title: z.string().max(200).optional(),
  text: z.string().min(1).max(10_000),
  source: z.string().max(400).optional(),
});

const RepoSchema = z.object({
  remote: z.string().max(400).optional(),
  commit: z.string().max(100).optional(),
  branch: z.string().max(200).optional(),
});

const RegisterInput = {
  token: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  domain: z.string().min(1).max(200),
  description: z.string().min(1).max(4000),
  tools: z.array(ToolSchema).max(MAX_TOOLS).optional(),
  schema: z.string().max(50_000).optional(),
  openapi: z.string().max(50_000).optional(),
  mcp_servers: z.array(McpServerSchema).max(50).optional(),
  mandates: z.array(MandateSchema).max(50).optional(),
  repo: RepoSchema.optional(),
};
const RefineInput = { draftId: z.string().min(1), note: z.string().min(1).max(4000) };
const GetDraftInput = { draftId: z.string().min(1) };
const CreateWorldInput = { draftId: z.string().min(1), worldId: z.string().min(1) };

// ───────────────────────────── the run's identity ─────────────────────────────

const ClientInfoSchema = z.object({ name: z.string(), version: z.string().optional() });

/**
 * The connecting client, as it identifies itself: `ctx.mcpReq.envelope` on a 2026-07-28-era
 * request, and the initialize-scoped accessor on a 2025-era one. Self-reported either way —
 * anything can claim to be `claude-code`, so this is a label for the reviewer, never an identity
 * check. The build token is what authorises a run.
 */
export function clientLabel(ctx: { mcpReq?: { envelope?: Record<string, unknown> } } | undefined, server: McpServer): string | undefined {
  const fromEnvelope = ClientInfoSchema.safeParse(ctx?.mcpReq?.envelope?.[CLIENT_INFO_META_KEY]);
  const info = fromEnvelope.success ? fromEnvelope.data : server.server.getClientVersion();
  if (!info?.name) return undefined;
  return info.version ? `${info.name} ${info.version}` : info.name;
}

/** `github.com/acme/support-bot@a1b2c3d` — what `built_by.repo` holds and re-runs are matched on. */
export function renderRepo(repo: z.infer<typeof RepoSchema> | undefined): string | undefined {
  const remote = repo?.remote?.trim();
  if (!remote) return undefined;
  const host = remote
    .replace(/^[a-z+]+:\/\//i, "")
    .replace(/^[^@/]+@/, "")
    .replace(/:(?=\D)/, "/")
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const commit = repo?.commit?.trim();
  return commit ? `${host}@${commit.slice(0, 7)}` : host;
}

/** The Worlds already built from this repo — so a second run refines rather than duplicating. */
function worldsBuiltFrom(repo: string | undefined): { id: string; status: string; repo: string }[] {
  if (!repo) return [];
  return loadPacks()
    .packs.filter((p) => p.meta.built_by?.repo === repo)
    .map((p) => ({ id: p.meta.id, status: p.meta.status, repo }));
}

/** The requested id, or the first free `<id>-2`, `<id>-3`… when it is taken. */
export function freeWorldId(worldId: string, taken: string[]): string {
  if (!taken.includes(worldId)) return worldId;
  for (let n = 2; n < 100; n++) {
    const candidate = `${worldId}-${n}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return `${worldId}-${Date.now()}`;
}

// ───────────────────────────── replies ─────────────────────────────

function draftSummary(draft: Draft, existingWorlds: { id: string; status: string }[]): string {
  return JSON.stringify({
    draftId: draft.id,
    valid: draft.errors.length === 0,
    errorCount: draft.errors.length,
    ...(existingWorlds.length > 0
      ? {
          existingWorlds,
          note: "This repo already built a World. A draft one can be refined and re-created; a published one must not be replaced — create a second World instead.",
        }
      : {}),
  });
}

function renderDraft(draft: Draft): string {
  const files = Object.entries(draft.files).map(([name, body]) => `## ${name}\n\n\`\`\`yaml\n${body}\`\`\``).join("\n\n");
  const errors = draft.errors.length === 0 ? "Valid — no outstanding errors." : draft.errors.map((e) => `- ${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`).join("\n");
  return [
    `# World structure draft ${draft.id}`,
    "",
    "This is the World only — its systems, entities, tools and Mandates, with an empty Seed. The rows, the Scenarios and the Attacks are generated on the platform once the World has been reviewed.",
    "",
    files,
    "",
    "## Validation",
    "",
    errors,
  ].join("\n");
}

const text = (body: string, isError = false) => ({ content: [{ type: "text" as const, text: body }], isError });

const NO_KEY = "ANTHROPIC_API_KEY is not set on the AgentSim server, so a World cannot be drafted.";

const handler = createMcpHandler(
  () => {
    const server = new McpServer(
      { name: "agentsim-worldbuilder", version: "0.2.0" },
      {
        instructions:
          "Builds a simulated test World for an agent, from what is true about it — you are running inside that agent's own repo, so gather this " +
          "yourself rather than asking the user for it: read the agent's tool definitions, its database schema or ORM models, any OpenAPI spec, the " +
          "third-party MCP servers its client config points at, and the rules its own system prompt or policy docs state. The one thing to ask the " +
          "user for is a build token, from /worlds/new on the AgentSim console. Then call register_agent with all of it — this drafts the World's " +
          "structure with Claude. Then get_world_draft to read it, refine_world with a plain-language change, and create_world once it looks right. " +
          "The World is created as a draft: do not write Scenarios, seed rows or Attacks yourself, and tell the user to review it and generate those " +
          "on the World's page, which is where they are written.",
      },
    );

    server.registerTool(
      "register_agent",
      {
        description: "Registers an agent and what it integrates, and drafts the structure of a World for testing it. Needs a build token from /worlds/new.",
        inputSchema: RegisterInput,
      },
      async (args, ctx) => {
        const spent = spendToken(args.token);
        if (spent !== "ok") return text(SPEND_MESSAGE[spent], true);
        if (!process.env.ANTHROPIC_API_KEY) return text(NO_KEY, true);

        const input: StructureInput = {
          name: args.name,
          domain: args.domain,
          description: args.description,
          schema: args.schema,
          tools: toolsToText(args.tools),
          openapi: args.openapi,
          mcpServers: args.mcp_servers,
          mandates: args.mandates,
        };
        const repo = renderRepo(args.repo);
        const result = await generateStructure(input);
        const draft = createDraft(input, { token: args.token, client: clientLabel(ctx, server), repo }, result);
        return text(draftSummary(draft, worldsBuiltFrom(repo)));
      },
    );

    server.registerTool(
      "refine_world",
      { description: "Regenerates a draft's structure with a plain-language change, keeping everything the change does not touch.", inputSchema: RefineInput },
      async (args) => {
        if (!process.env.ANTHROPIC_API_KEY) return text(NO_KEY, true);
        const draft = getDraft(args.draftId);
        // The draft id is the authorisation here: its token was already spent to create it.
        if (!draft) return text(`Unknown draft ${args.draftId}`, true);
        const result = await generateStructure(draft.input, undefined, { note: args.note, previousFiles: draft.files });
        // generateStructure can run for minutes; the draft can cross its TTL while it's in flight.
        const updated = updateDraft(draft.id, result);
        if (!updated) return text(`Draft ${draft.id} expired while refining — start over with register_agent.`, true);
        return text(draftSummary(updated, []));
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
      {
        description: "Persists a draft as a draft World, at worldId. Fails if the draft still has validation errors. The World is not runnable until a human reviews it and publishes it.",
        inputSchema: CreateWorldInput,
      },
      async (args) => {
        const draft = getDraft(args.draftId);
        if (!draft) return text(`Unknown draft ${args.draftId}`, true);
        if (!isValidWorldId(args.worldId)) return text("worldId must be 2-41 characters: lowercase letters, digits and hyphens, starting with a letter or digit.", true);

        const id = freeWorldId(args.worldId, listPackIds());
        const files = { ...draft.files, "pack.yaml": withPackId(draft.files["pack.yaml"] ?? "", id) };
        const builtBy: BuildInfo = {
          source: "plugin",
          run: draft.id,
          token: draft.meta.token,
          ...(draft.meta.client ? { client: draft.meta.client } : {}),
          ...(draft.meta.repo ? { repo: draft.meta.repo } : {}),
          at: new Date().toISOString(),
        };
        const res = await createWorldRoute(
          new Request("http://internal/api/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, files, builtBy }) }),
        );
        const data = (await res.json()) as { error?: string; errors?: unknown[] };
        if (!res.ok) return text(JSON.stringify(data), true);
        return text(
          JSON.stringify({
            worldId: id,
            url: `/worlds/${id}`,
            status: "draft",
            ...(id === args.worldId ? {} : { note: `'${args.worldId}' was taken, so the World was created as '${id}'.` }),
            next: `Review the World at /worlds/${id} — check the ownership chain, then generate its Scenarios and seed data on its Scenarios tab and publish it. Nothing can run against it until it is published.`,
          }),
        );
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
