// A second MCP server, alongside /mcp/runs/[runId]: not scoped to a Run, scoped to *building* a
// World. A developer's own MCP client (Claude Code, or any other) connects here from inside their
// agent's repo — the "Figma plugin" pattern: the client pushes what it knows to us, we never scrape it.
//
// **The client writes the YAML.** It is the one party with the repo open, and it is already a model,
// so there is nothing for a model call on our side to add: it reads `get_world_format`, writes the
// pack files against what the codebase actually says, checks them with `validate_world_files` (the
// platform's own Zod validator, no model, no cost) and submits them with `create_world`. AgentSim
// spends nothing here and needs no API key for this route — and the validator is still the only way
// a World gets written, so a client cannot talk its way past it.
//
// What the client captures is the World's *structure*: the agent's tools, its database schema, the
// third-party MCP servers it integrates (shadowed here), and the Mandates its own policy states.
// What the World is *tested* with — seed rows, Scenarios, Attacks — is generated on the platform
// afterwards, because the client has no business inventing the test from inside the repo.
//
// `create_world` spends a build token and persists the files through the exact path
// POST /api/worlds already uses — as a **draft** World, which cannot be run until a human reviews
// it on the platform and publishes it.
import { CLIENT_INFO_META_KEY, createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { PUT as updateWorldRoute } from "@/app/api/worlds/[id]/route";
import { POST as createWorldRoute } from "@/app/api/worlds/route";
import { bindToken, boundWorldId, CLAIM_MESSAGE, tokenStatus } from "@/generate/buildTokens";
import { loadFormatDoc } from "@/generate/formatDoc";
import { listPackIds, loadPack, parsePackFiles, type BuildInfo, type ValidationError } from "@/engine/pack";
import { guardMcpRequest } from "@/lib/mcpAccess";
import { loadPacks } from "@/lib/summaries";
import { freeWorldId, isValidWorldId, withPackId } from "@/ui/worlds/editorLogic";
import { withBuiltBy, withPackStatus } from "@/ui/worlds/packEdits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RepoSchema = z.object({
  remote: z.string().max(400).optional(),
  commit: z.string().max(100).optional(),
  branch: z.string().max(200).optional(),
});

/** A pack as files: `pack.yaml`, `tools.yaml`, `seed.yaml`. Same shape validate and create take. */
const Files = z.record(z.string().min(1).max(200), z.string().max(200_000));

const FormatInput = { repo: RepoSchema.optional() };
const ValidateInput = { files: Files };
const CreateWorldInput = { token: z.string().min(1).max(100), worldId: z.string().min(1), files: Files, repo: RepoSchema.optional() };


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

/** At most this many errors are returned inline — enough to fix a file, short of flooding a reply. */
const MAX_INLINE_ERRORS = 20;

const inlineErrors = (errors: ValidationError[]) => errors.slice(0, MAX_INLINE_ERRORS).map((e) => `${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`);

const text = (body: string, isError = false) => ({ content: [{ type: "text" as const, text: body }], isError });

const handler = createMcpHandler(
  () => {
    const server = new McpServer(
      { name: "agentsim-worldbuilder", version: "0.3.0" },
      {
        instructions:
          "Builds a simulated test World for an agent, from what is true about it — you are running inside that agent's own repo, so gather this " +
          "yourself rather than asking the user for it: read the agent's tool definitions, its database schema or ORM models, any OpenAPI spec, the " +
          "third-party MCP servers its client config points at, and the rules its own system prompt or policy docs state. The one thing to ask the " +
          "user for is a build token, from /worlds/new on the AgentSim console. You write the World yourself: call get_world_format for the format " +
          "reference, write pack.yaml, tools.yaml and an empty seed.yaml against what the repo actually says, check them with validate_world_files " +
          "until it reports valid, then submit them with create_world. Nothing here costs a model call on AgentSim's side, so iterate as much as the " +
          "World needs. One token covers one World's review cycle: the first create_world binds the token to the World it makes so every later one " +
          "updates that same World in place, and publishing that World rotates the token. " +
          "The World is created as a draft: do not write Scenarios, seed rows or Attacks yourself, and tell the user to review it and generate those " +
          "on the World's page, which is where they are written.",
      },
    );

    server.registerTool(
      "get_world_format",
      {
        description:
          "The World pack format reference — write your files against this. Pass `repo` to be told whether this repo already built a World. Costs nothing.",
        inputSchema: FormatInput,
      },
      async (args) => {
        const existing = worldsBuiltFrom(renderRepo(args.repo));
        return text(
          [
            "Write three files, and submit them with `create_world`:",
            "",
            "- `pack.yaml` — the systems, the entities, the ownership chain between them, and the Mandates the repo's own policy states.",
            "- `tools.yaml` — one entry per tool the agent really has, against those entities. Do not invent a tool, and do not invent a guard the code does not enforce.",
            "- `seed.yaml` — `now`, `currency`, and an **empty array for every entity** `pack.yaml` declares. No rows: those are generated on the platform, against this structure.",
            "",
            "Write no `scenarios/` file and no `agents/` file. The Scenarios, the Checks and the Attacks are claims about what the agent *should* do — they are generated on the World's page, where a human reviews them.",
            "Check your files with `validate_world_files` first; it is the same validator `create_world` runs, and it costs nothing to press.",
            ...(existing.length > 0
              ? ["", `**This repo already built a World:** ${existing.map((w) => `${w.id} (${w.status})`).join(", ")}. A draft one is updated by the token that built it; a published one must not be replaced — build a second World instead.`]
              : []),
            "",
            "---",
            "",
            loadFormatDoc(),
          ].join("\n"),
        );
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
            errors: inlineErrors(errors),
            ...(errors.length > MAX_INLINE_ERRORS ? { moreErrors: errors.length - MAX_INLINE_ERRORS } : {}),
          }),
        );
      },
    );

    server.registerTool(
      "create_world",
      {
        description:
          "Persists your pack files as a draft World at worldId. Needs a build token from /worlds/new, and refuses files that do not validate. The World is not runnable until a human reviews it and publishes it.",
        inputSchema: CreateWorldInput,
      },
      async (args, ctx) => {
        // `tokenStatus`, not a claim: nothing here spends a model call, so the only rules left are
        // about ownership — this token was rotated, or the World it owns has already gone live.
        const status = tokenStatus(args.token, isPublishedWorld);
        if (status !== "ok") return text(CLAIM_MESSAGE[status], true);

        // Validated before anything is written, so a bad pack comes back in `validate_world_files`'
        // words rather than as an HTTP body from the create route.
        const { pack, errors } = parsePackFiles(args.files);
        if (!pack || errors.length > 0) {
          return text(
            JSON.stringify({
              valid: false,
              errorCount: errors.length,
              errors: inlineErrors(errors),
              ...(errors.length > MAX_INLINE_ERRORS ? { moreErrors: errors.length - MAX_INLINE_ERRORS } : {}),
              fix: "Nothing was written. Fix these and call create_world again.",
            }),
            true,
          );
        }

        // A token owns one World. The first create takes an id — deduped, so a name already in use
        // does not strand the caller — and binds the token to it; every create after that writes
        // over that same World, for as long as it is still a draft under review.
        const owned = boundWorldId(args.token);
        if (!owned && !isValidWorldId(args.worldId)) {
          return text("worldId must be 2-41 characters: lowercase letters, digits and hyphens, starting with a letter or digit.", true);
        }

        const taken = listPackIds();
        const id = owned ?? freeWorldId(args.worldId, taken);
        const client = clientLabel(ctx, server);
        const repo = renderRepo(args.repo);
        const builtBy: BuildInfo = {
          source: "plugin",
          token: args.token,
          ...(client ? { client } : {}),
          ...(repo ? { repo } : {}),
          at: new Date().toISOString(),
        };
        const packYaml = withPackId(args.files["pack.yaml"] ?? "", id);
        const files = { ...args.files, "pack.yaml": packYaml };

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
        bindToken(args.token, id);
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
