// Smoke-tests /mcp/worlds over its real handler, the same way tests/api/mcp.test.ts does for
// /mcp/runs/:id. register_agent/refine_world call the real Anthropic client with no injected deps
// (same as POST /api/worlds/generate), so — matching how that route is already tested — this file
// never drives them past the missing-API-key guard; get_world_draft/create_world are exercised
// fully by seeding a draft directly through createDraft, which needs no model call at all.
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { PUT as updateWorld } from "@/app/api/worlds/[id]/route";
import { clientLabel, draftSummary, freeWorldId, POST as mcpWorldsRoute, renderRepo } from "@/app/mcp/worlds/route";
import type { McpServer } from "@modelcontextprotocol/server";
import { loadPack, packsDir, type PackFiles } from "@/engine/pack";
import { issueToken } from "@/generate/buildTokens";
import { bindToken, issueToken as issueBuildToken } from "@/generate/buildTokens";
import { createDraft } from "@/generate/draftRegistry";
import { withPackStatus } from "@/ui/worlds/packEdits";
import { copyFixturePacks } from "../helpers/packs";

type Rpc = { status: number; sessionId: string | null; result: Record<string, unknown> };

async function rpc(body: unknown, sessionId?: string | null): Promise<Rpc> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json, text/event-stream", host: "127.0.0.1:3000" };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  const res = await mcpWorldsRoute(new Request("http://127.0.0.1:3000/mcp/worlds", { method: "POST", headers, body: JSON.stringify(body) }));
  const text = await res.text();
  const frame = text.split("\n").find((l) => l.startsWith("data:"));
  const parsed = frame ? (JSON.parse(frame.slice(5)) as { result?: Record<string, unknown> }) : {};
  return { status: res.status, sessionId: res.headers.get("mcp-session-id"), result: parsed.result ?? {} };
}

const initialize = () => rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
const call = (sessionId: string | null, name: string, args: unknown, id = 2) => rpc({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, sessionId);

function textOf(result: Record<string, unknown>): string {
  const content = result.content as { type: string; text: string }[];
  return content[0]?.text ?? "";
}

let northwindFiles: PackFiles;

beforeAll(() => {
  copyFixturePacks();
  northwindFiles = loadPack("northwind").files; // real, valid files — seeding create_world needs no model call
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("/mcp/worlds", () => {
  it("hands the client instructions naming register_agent, and lists exactly the 5 tools", async () => {
    const init = await initialize();
    expect(init.status).toBe(200);
    expect(init.result.instructions as string).toContain("register_agent");

    const listed = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
    const names = (listed.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(["register_agent", "refine_world", "validate_world_files", "get_world_draft", "create_world"]);
  });

  it("register_agent refuses to spend anything when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const init = await initialize();
    const res = await call(init.sessionId, "register_agent", { token: issueToken().token, name: "Acme Helpdesk", domain: "helpdesk", description: "An IT helpdesk." });
    expect(res.result.isError).toBe(true);
    expect(textOf(res.result)).toContain("ANTHROPIC_API_KEY");
  });

  // The token is the gate, so it is checked before anything else — including the API key, which is
  // the guard that would otherwise be doing this job by accident.
  it("register_agent refuses a token AgentSim never issued", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-not-a-real-key";
    const init = await initialize();

    const bogus = await call(init.sessionId, "register_agent", { token: "wb_nope", name: "A", domain: "d", description: "x" });
    expect(bogus.result.isError).toBe(true);
    expect(textOf(bogus.result)).toContain("not one AgentSim issued");
  });

  // An attempt that drafts nothing gives the token back. The operator is holding a token and a
  // failure message; sending them to the console for a fresh one would charge them for our fault.
  it("register_agent leaves a token usable when the attempt produced no draft", async () => {
    const init = await initialize();
    const token = issueToken().token;

    delete process.env.ANTHROPIC_API_KEY; // gets past the token, stops at the key
    const first = await call(init.sessionId, "register_agent", { token, name: "A", domain: "d", description: "x" });
    expect(textOf(first.result)).toContain("ANTHROPIC_API_KEY");

    const again = await call(init.sessionId, "register_agent", { token, name: "A", domain: "d", description: "x" });
    expect(textOf(again.result)).not.toContain("already");
    expect(textOf(again.result)).toContain("ANTHROPIC_API_KEY"); // the same wall, not a spent token
  });

  // A token owns one World for one review cycle: it may rewrite that World as often as the review
  // needs, it may never be spent on a second one, and publishing it ends the token's life.
  describe("a token owns one World", () => {
    const seed = (token: string) =>
      createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { token }, { files: northwindFiles, errors: [], attempts: 1 });

    it("writes a second create over the same World instead of making another", async () => {
      const token = issueToken().token;
      const init = await initialize();

      const first = await call(init.sessionId, "create_world", { draftId: seed(token).id, worldId: "nw-owned" });
      expect(JSON.parse(textOf(first.result)).worldId).toBe("nw-owned");

      // A different requested id, the same token: the World it owns is what gets written.
      const second = await call(init.sessionId, "create_world", { draftId: seed(token).id, worldId: "nw-somewhere-else" });
      const body = JSON.parse(textOf(second.result)) as { worldId: string; updated?: boolean; note?: string };
      expect(body.worldId).toBe("nw-owned");
      expect(body.updated).toBe(true);
      expect(body.note).toContain("nw-somewhere-else");
      expect(existsSync(path.join(packsDir(), "nw-somewhere-else"))).toBe(false);
      expect(loadPack("nw-owned").meta.status).toBe("draft"); // an update keeps it under review
    });

    it("refuses to write to that World once it is published, and the token is rotated", async () => {
      const token = issueToken().token;
      const init = await initialize();

      const created = await call(init.sessionId, "create_world", { draftId: seed(token).id, worldId: "nw-publishing" });
      expect(created.result.isError).toBeFalsy();

      // Publish it the way the console does — a PUT with `status: ready` — and take the successor.
      const files = loadPack("nw-publishing").files;
      const res = await updateWorld(new Request("http://internal/api/worlds/nw-publishing", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ files: { ...files, "pack.yaml": withPackStatus(files["pack.yaml"] ?? "", "ready") } }),
      }), { params: Promise.resolve({ id: "nw-publishing" }) });
      const published = (await res.json()) as { rotatedToken?: string };
      expect(res.status).toBe(200);
      expect(published.rotatedToken).toMatch(/^wb_[0-9a-f]{8}$/);
      expect(published.rotatedToken).not.toBe(token);

      // Publication rotates before anything else can happen, so "rotated" is what a late write is
      // told — and that message names the publication and where the successor is.
      const blocked = await call(init.sessionId, "create_world", { draftId: seed(token).id, worldId: "nw-publishing" });
      expect(blocked.result.isError).toBe(true);
      expect(textOf(blocked.result)).toContain("rotated");
      expect(textOf(blocked.result)).toContain("published");
      expect(existsSync(path.join(packsDir(), "nw-publishing-2"))).toBe(false); // and it created nothing

      process.env.ANTHROPIC_API_KEY = "sk-ant-not-a-real-key";
      const redraft = await call(init.sessionId, "register_agent", { token, name: "A", domain: "d", description: "x" });
      expect(redraft.result.isError).toBe(true);
      expect(textOf(redraft.result)).toContain("rotated");
    });
  });

  // Validation on demand: no token, no draft, no write. The same `parsePackFiles` the platform
  // writes through, so a caller can check an edit before it commits to one.
  it("validate_world_files reports a valid pack, and every problem in a broken one", async () => {
    const init = await initialize();

    const good = await call(init.sessionId, "validate_world_files", { files: northwindFiles });
    expect(JSON.parse(textOf(good.result))).toMatchObject({ valid: true, errorCount: 0 });

    const broken = { ...northwindFiles, "tools.yaml": `${northwindFiles["tools.yaml"]}\nbroken:\n  system: nope\n` };
    const bad = await call(init.sessionId, "validate_world_files", { files: broken });
    const body = JSON.parse(textOf(bad.result)) as { valid: boolean; errorCount: number; errors: string[] };
    expect(body.valid).toBe(false);
    expect(body.errorCount).toBeGreaterThan(0);
    expect(body.errors.join(" ")).toContain("tools.yaml");
    // It writes nothing, so the World it was handed is untouched on disk.
    expect(existsSync(path.join(packsDir(), "broken"))).toBe(false);
  });

  it("get_world_draft renders a seeded draft's files and its validation state", async () => {
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { token: "wb_seeded", client: "claude-code 2.0.9", repo: "github.com/nw/bot@a1b2c3d" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "get_world_draft", { draftId: draft.id });
    expect(res.result.isError).toBeFalsy();
    expect(textOf(res.result)).toContain("pack.yaml");
    expect(textOf(res.result)).toContain("Valid");
  });

  it("create_world persists a seeded valid draft through the real POST /api/worlds path", async () => {
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { token: "wb_seeded", client: "claude-code 2.0.9", repo: "github.com/nw/bot@a1b2c3d" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "create_world", { draftId: draft.id, worldId: "northwind-mcp" });
    expect(res.result.isError).toBeFalsy();
    const { worldId, url, status } = JSON.parse(textOf(res.result)) as { worldId: string; url: string; status: string };
    expect(worldId).toBe("northwind-mcp");
    expect(url).toBe("/worlds/northwind-mcp");
    expect(status).toBe("draft");
    expect(existsSync(path.join(packsDir(), "northwind-mcp", "pack.yaml"))).toBe(true);

    // A plugin-built World arrives in review, and remembers the run that built it.
    const meta = loadPack("northwind-mcp").meta;
    expect(meta.id).toBe("northwind-mcp"); // withPackId stamped the new id
    expect(meta.status).toBe("draft");
    // The client is the one captured when the run registered, not whoever is calling create_world.
    expect(meta.built_by).toMatchObject({ source: "plugin", run: draft.id, token: "wb_seeded", client: "claude-code 2.0.9", repo: "github.com/nw/bot@a1b2c3d" });
  });

  it("create_world on a taken id creates the next free one rather than overwriting", async () => {
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { token: "wb_seeded2" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "create_world", { draftId: draft.id, worldId: "northwind" });
    expect(res.result.isError).toBeFalsy();
    const { worldId, note } = JSON.parse(textOf(res.result)) as { worldId: string; note?: string };
    expect(worldId).toBe("northwind-2");
    expect(note).toContain("was taken");
    expect(loadPack("northwind").meta.status).toBe("ready"); // the installed World is untouched
  });

  it("refuses get_world_draft/refine_world/create_world for an unknown draftId", async () => {
    const init = await initialize();
    for (const [name, args] of [
      ["get_world_draft", { draftId: "draft_nope" }],
      ["refine_world", { draftId: "draft_nope", note: "x" }],
      ["create_world", { draftId: "draft_nope", worldId: "whatever" }],
    ] as const) {
      const res = await call(init.sessionId, name, args);
      expect(res.result.isError).toBe(true);
    }
  });

  it("rejects create_world with an invalid worldId before touching the filesystem", async () => {
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { token: "wb_seeded", client: "claude-code 2.0.9", repo: "github.com/nw/bot@a1b2c3d" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "create_world", { draftId: draft.id, worldId: "Not Valid!" });
    expect(res.result.isError).toBe(true);
    expect(existsSync(path.join(packsDir(), "Not Valid!"))).toBe(false);
  });

  it("register_agent rejects an oversized tool inputSchema before it can spend anything", async () => {
    delete process.env.ANTHROPIC_API_KEY; // proves this never even reaches the API-key guard
    const init = await initialize();
    const oversized = { big: "x".repeat(6_000) };

    const res = await call(init.sessionId, "register_agent", {
      name: "Test",
      domain: "d",
      description: "desc",
      token: issueToken().token,
      tools: [{ name: "t", inputSchema: oversized }],
    });

    expect(res.result.isError).toBe(true);
    expect(textOf(res.result)).toContain("inputSchema is too large");
  });
});

// ══════════════════════════════════════════════════════════════════════════
// Identifying a run: who connected, from which repo, under which id
// ══════════════════════════════════════════════════════════════════════════

describe("clientLabel", () => {
  const stub = (version?: { name: string; version?: string }) => ({ server: { getClientVersion: () => version } }) as unknown as McpServer;

  it("prefers the per-request envelope over the deprecated initialize-scoped accessor", () => {
    const ctx = { mcpReq: { envelope: { "io.modelcontextprotocol/clientInfo": { name: "claude-code", version: "2.0.9" } } } };
    expect(clientLabel(ctx, stub({ name: "stale", version: "0.1" }))).toBe("claude-code 2.0.9");
  });

  it("falls back to the accessor on a 2025-era connection, which carries no envelope", () => {
    expect(clientLabel({ mcpReq: {} }, stub({ name: "some-client", version: "3" }))).toBe("some-client 3");
    expect(clientLabel(undefined, stub({ name: "nameless-version" }))).toBe("nameless-version");
  });

  it("is undefined when nothing identified itself, rather than inventing a label", () => {
    expect(clientLabel({ mcpReq: { envelope: {} } }, stub(undefined))).toBeUndefined();
    expect(clientLabel({ mcpReq: { envelope: { "io.modelcontextprotocol/clientInfo": { version: "2" } } } }, stub(undefined))).toBeUndefined();
  });
});

describe("renderRepo", () => {
  it("renders an ssh or https remote and a short commit as one comparable string", () => {
    expect(renderRepo({ remote: "git@github.com:acme/support-bot.git", commit: "a1b2c3d4e5f6" })).toBe("github.com/acme/support-bot@a1b2c3d");
    expect(renderRepo({ remote: "https://github.com/acme/support-bot.git", commit: "a1b2c3d4e5f6" })).toBe("github.com/acme/support-bot@a1b2c3d");
    expect(renderRepo({ remote: "https://gitlab.com/acme/bot/" })).toBe("gitlab.com/acme/bot");
  });

  it("is undefined without a remote, so a repo-less run is not matched against another one", () => {
    expect(renderRepo(undefined)).toBeUndefined();
    expect(renderRepo({ commit: "a1b2c3d" })).toBeUndefined();
    expect(renderRepo({ remote: "   " })).toBeUndefined();
  });
});

// What `register_agent` and `refine_world` hand back. A count alone made the caller choose between
// another round trip and reporting a dead end, so the errors themselves travel with it.
describe("draftSummary", () => {
  const seed = (errors: { file: string; path: string; message: string }[], token = "wb_x") =>
    createDraft({ name: "N", domain: "d", description: "x" }, { token }, { files: {}, errors, attempts: 1 });

  it("carries the errors, not just how many", () => {
    const draft = seed([{ file: "tools.yaml", path: "tools.a.set.status", message: "'pending' is not a declared value" }]);
    const body = JSON.parse(draftSummary(draft, [])) as { valid: boolean; errorCount: number; errors: string[]; fix: string };

    expect(body.valid).toBe(false);
    expect(body.errorCount).toBe(1);
    expect(body.errors).toEqual(["tools.yaml · tools.a.set.status: 'pending' is not a declared value"]);
    expect(body.fix).toContain("refine_world");
  });

  it("says nothing about errors when there are none", () => {
    const body = JSON.parse(draftSummary(seed([]), [])) as Record<string, unknown>;
    expect(body).toMatchObject({ valid: true, errorCount: 0 });
    expect(body).not.toHaveProperty("errors");
    expect(body).not.toHaveProperty("fix");
  });

  // Both of these notes used to be keyed `note`, and object spread let the second overwrite the
  // first — so the warning that a create would *overwrite* a World vanished in exactly the case it
  // mattered: a re-run against a repo that already has one.
  it("keeps the ownership warning when the repo also has existing Worlds", () => {
    const token = issueBuildToken().token;
    const draft = seed([], token);
    bindToken(token, "nw-owned");

    const body = JSON.parse(draftSummary(draft, [{ id: "nw-owned", status: "draft" }])) as Record<string, string>;
    expect(body.updatesWorld).toBe("nw-owned");
    expect(body.updatesNote).toContain("writes this draft over it");
    expect(body.existingNote).toContain("already built a World");
  });
});

describe("freeWorldId", () => {
  it("keeps the asked-for id when it is free, and suffixes past every taken one", () => {
    expect(freeWorldId("northwind", [])).toBe("northwind");
    expect(freeWorldId("northwind", ["northwind"])).toBe("northwind-2");
    expect(freeWorldId("northwind", ["northwind", "northwind-2", "northwind-3"])).toBe("northwind-4");
  });
});

describe("/mcp/worlds host allowlist", () => {
  it("refuses a tunnel hostname by default", async () => {
    const res = await mcpWorldsRoute(
      new Request("http://agentsim.loca.lt/mcp/worlds", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", host: "agentsim.loca.lt" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
