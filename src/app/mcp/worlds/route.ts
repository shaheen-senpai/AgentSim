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
import { PUT as updateWorldRoute } from "@/app/api/worlds/[id]/route";
import { POST as createWorldRoute } from "@/app/api/worlds/route";
import { bindToken, boundWorldId, CLAIM_MESSAGE, claimToken, releaseToken, tokenStatus } from "@/generate/buildTokens";
import { createDraft, getDraft, updateDraft, type Draft } from "@/generate/draftRegistry";
import { generateStructure, toolsToText, type StructureInput } from "@/generate/structure";
import { listPackIds, loadPack, parsePackFiles, type BuildInfo } from "@/engine/pack";
import { guardMcpRequest } from "@/lib/mcpAccess";
import { loadPacks } from "@/lib/summaries";
import { freeWorldId, isValidWorldId, withPackId } from "@/ui/worlds/editorLogic";
import { withBuiltBy, withPackStatus } from "@/ui/worlds/packEdits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Generation is a long Opus call with a retry. Kept at or above the plugin's own timeout
// (`claude-plugin/.mcp.json`, 600_000ms): a shorter budget here means the platform kills the
// request while the client is still waiting, and the caller learns nothing about why.
export const maxDuration = 600;

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
const ValidateInput = { files: z.record(z.string().min(1).max(200), z.string().max(200_000)) };
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

/**
 * Whether a World has been published — the end of its build token's life. A World that is missing
 * (discarded) or unloadable is not published: the token still owns that id and may write it again.
 */
export function isPublishedWorld(worldId: string): boolean {
  if (!listPackIds().includes(worldId)) return false;
  try {
    return loadPack(worldId).meta.status !== "draft";
  } catch {
    return false;
  }
}

/** The Worlds already built from this repo — so a second run refines rather than duplicating. */
function worldsBuiltFrom(repo: string | undefined): { id: string; status: string; repo: string }[] {
  if (!repo) return [];
  return loadPacks()
    .packs.filter((p) => p.meta.built_by?.repo === repo)
    .map((p) => ({ id: p.meta.id, status: p.meta.status, repo }));
}

// `freeWorldId` moved to `@/ui/worlds/editorLogic` so the workspace wizard — a client component,
// which cannot reach this server route — dedupes through the same function. Re-exported because
// it is this route's contract that is being tested.
export { freeWorldId } from "@/ui/worlds/editorLogic";

// ───────────────────────────── replies ─────────────────────────────

/** At most this many errors are returned inline; the rest are read with `get_world_draft`. */
const MAX_INLINE_ERRORS = 20;

export function draftSummary(draft: Draft, existingWorlds: { id: string; status: string }[]): string {
  const owned = boundWorldId(draft.meta.token);
  return JSON.stringify({
    draftId: draft.id,
    valid: draft.errors.length === 0,
    errorCount: draft.errors.length,
    // The errors themselves, not just how many. A count alone told the caller its draft was broken
    // and nothing about how, so the only way forward was another round trip — or, worse, reporting
    // a dead end to the operator when the fix was one `refine_world` away.
    ...(draft.errors.length > 0
      ? {
          errors: draft.errors.slice(0, MAX_INLINE_ERRORS).map((e) => `${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`),
          ...(draft.errors.length > MAX_INLINE_ERRORS ? { moreErrors: draft.errors.length - MAX_INLINE_ERRORS } : {}),
          fix: "Call refine_world with a note naming these, or read the whole draft with get_world_draft. create_world refuses a draft that still has errors.",
        }
      : {}),
    // Distinct keys: both of these used to be `note`, and object spread let the second silently
    // overwrite the first — so the "this updates World X" warning vanished in exactly the case it
    // mattered, a re-run against a repo that already has Worlds.
    ...(owned ? { updatesWorld: owned, updatesNote: `This token already built World '${owned}', so create_world writes this draft over it rather than creating another.` } : {}),
    ...(existingWorlds.length > 0
      ? {
          existingWorlds,
          existingNote: "This repo already built a World. A draft one can be refined and re-created; a published one must not be replaced — create a second World instead.",
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
          "One token covers one World's review cycle: an attempt that drafts nothing does not spend it, the first create_world binds the token to " +
          "the World it makes so every later one updates that same World in place, and publishing that World rotates the token. " +
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
        const claim = claimToken(args.token, isPublishedWorld);
        if (claim !== "ok") return text(CLAIM_MESSAGE[claim], true);
        if (!process.env.ANTHROPIC_API_KEY) {
          releaseToken(args.token);
          return text(NO_KEY, true);
        }

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
        // A drafting attempt that produces nothing hands the token back: the operator got no draft,
        // so making them fetch a fresh token punishes them for our fault. Only `create_world`
        // spends one for good.
        let result;
        try {
          result = await generateStructure(input);
        } catch (e) {
          releaseToken(args.token);
          return text(`${e instanceof Error ? e.message : String(e)}\n\nYour build token was not spent — call register_agent again with the same one.`, true);
        }
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
      "validate_world_files",
      {
        description:
          "Checks a set of World pack files against the same validator the platform writes through, and returns every problem found. Writes nothing and needs no token. Use it to check an edit before create_world, or to confirm a fix.",
        inputSchema: ValidateInput,
      },
      async (args) => {
        // `parsePackFiles` directly rather than POST /api/worlds/validate: same function, no
        // self-fetch. It never throws — an unparseable file comes back as an error with its line.
        const { pack, errors } = parsePackFiles(args.files);
        return text(
          JSON.stringify({
            valid: pack !== null && errors.length === 0,
            errorCount: errors.length,
            errors: errors.slice(0, MAX_INLINE_ERRORS).map((e) => `${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`),
            ...(errors.length > MAX_INLINE_ERRORS ? { moreErrors: errors.length - MAX_INLINE_ERRORS } : {}),
          }),
        );
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

        // A token owns one World. The first create takes an id — deduped, so a name already in use
        // does not strand the caller — and binds the token to it; every create after that writes
        // over that same World, for as long as it is still a draft under review.
        const owned = boundWorldId(draft.meta.token);
        const status = tokenStatus(draft.meta.token, isPublishedWorld);
        if (status === "published") {
          return text(
            `World '${owned}' — the one this token built — has been published, so the plugin cannot write to it again. Publishing rotated the token; its replacement is on /worlds/${owned}. Use a fresh token from /worlds/new to build a different World.`,
            true,
          );
        }
        // A rotated token is finished: it must not fall through and quietly create a second World.
        if (status === "rotated") return text(CLAIM_MESSAGE.rotated, true);
        if (!owned && !isValidWorldId(args.worldId)) {
          return text("worldId must be 2-41 characters: lowercase letters, digits and hyphens, starting with a letter or digit.", true);
        }

        const taken = listPackIds();
        const id = owned ?? freeWorldId(args.worldId, taken);
        const builtBy: BuildInfo = {
          source: "plugin",
          run: draft.id,
          token: draft.meta.token,
          ...(draft.meta.client ? { client: draft.meta.client } : {}),
          ...(draft.meta.repo ? { repo: draft.meta.repo } : {}),
          at: new Date().toISOString(),
        };
        const packYaml = withPackId(draft.files["pack.yaml"] ?? "", id);
        const files = { ...draft.files, "pack.yaml": packYaml };

        // An update, when the token already owns a World that is still there. `PUT` writes the
        // files as given, so the draft status and the build record are stamped here — the same two
        // marks `POST /api/worlds` applies on the way in.
        const updating = owned !== undefined && taken.includes(id);
        const res = updating
          ? await updateWorldRoute(
              new Request(`http://internal/api/worlds/${id}`, {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ files: { ...files, "pack.yaml": withBuiltBy(withPackStatus(packYaml, "draft"), builtBy) } }),
              }),
              { params: Promise.resolve({ id }) },
            )
          : await createWorldRoute(
              new Request("http://internal/api/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, files, builtBy }) }),
            );
        const data = (await res.json()) as { error?: string; errors?: unknown[] };
        if (!res.ok) return text(JSON.stringify(data), true);
        bindToken(draft.meta.token, id);
        return text(
          JSON.stringify({
            worldId: id,
            url: `/worlds/${id}`,
            status: "draft",
            ...(updating
              ? { updated: true, note: `This token owns World '${id}', so the draft was written over it${args.worldId === id ? "" : ` and '${args.worldId}' was ignored`}.` }
              : id === args.worldId
                ? {}
                : { note: `'${args.worldId}' was taken, so the World was created as '${id}'.` }),
            next: `Review the World at /worlds/${id} — check the ownership chain, then generate its Scenarios and seed data on its Scenarios tab and publish it. Nothing can run against it until it is published, and publishing it rotates this build token.`,
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
