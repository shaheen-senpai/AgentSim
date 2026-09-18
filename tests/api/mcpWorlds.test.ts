// `/mcp/worlds` end to end over real JSON-RPC frames: the client writes the pack files, the server
// validates them and creates the World. Nothing here spends a model call, which is the point.
import { existsSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { PUT as updateWorld } from "@/app/api/worlds/[id]/route";
import { clientLabel, freeWorldId, POST as mcpWorldsRoute, renderRepo } from "@/app/mcp/worlds/route";
import type { McpServer } from "@modelcontextprotocol/server";
import { loadPack, packsDir, type PackFiles } from "@/engine/pack";
import { issueToken } from "@/generate/buildTokens";
import { withPackStatus } from "@/ui/worlds/packEdits";
import { usePacksDir } from "../helpers/packs";

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
  usePacksDir();
  northwindFiles = loadPack("northwind").files; // a real, valid pack — what a client's own session would have written
});

describe("/mcp/worlds", () => {
  it("lists exactly the three tools, and tells the client it writes the files itself", async () => {
    const init = await initialize();
    expect(init.status).toBe(200);
    expect(init.result.instructions as string).toContain("get_world_format");

    const listed = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
    const names = (listed.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(["get_world_format", "validate_world_files", "create_world"]);
  });

  it("get_world_format hands over the DSL reference and names the three files to write", async () => {
    const init = await initialize();
    const res = await call(init.sessionId, "get_world_format", {});
    const body = textOf(res.result);
    expect(body).toContain("The World pack format"); // the doc itself, not a summary of it
    expect(body).toContain("seed.yaml");
    expect(body).not.toContain("already built a World");
  });

  it("get_world_format warns when this repo already built a World", async () => {
    const init = await initialize();
    const token = issueToken().token;
    await call(init.sessionId, "create_world", { token, worldId: "nw-from-repo", files: northwindFiles, repo: { remote: "git@github.com:nw/bot.git", commit: "a1b2c3d4" } });

    const res = await call(init.sessionId, "get_world_format", { repo: { remote: "https://github.com/nw/bot", commit: "a1b2c3d4" } });
    expect(textOf(res.result)).toContain("already built a World");
    expect(textOf(res.result)).toContain("nw-from-repo");
  });

  // Validation on demand: no token, no write. The same `parsePackFiles` the platform writes
  // through, so a client can check its own YAML before it commits to it.
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
    expect(existsSync(path.join(packsDir(), "broken"))).toBe(false);
  });

  it("create_world persists the client's files through the real POST /api/worlds path", async () => {
    const token = issueToken().token;
    const init = await initialize();

    const res = await call(init.sessionId, "create_world", { token, worldId: "northwind-mcp", files: northwindFiles, repo: { remote: "git@github.com:nw/bot.git", commit: "a1b2c3d4e5f6" } });
    expect(res.result.isError).toBeFalsy();
    const { worldId, url, status } = JSON.parse(textOf(res.result)) as { worldId: string; url: string; status: string };
    expect(worldId).toBe("northwind-mcp");
    expect(url).toBe("/worlds/northwind-mcp");
    expect(status).toBe("draft");
    expect(existsSync(path.join(packsDir(), "northwind-mcp", "pack.yaml"))).toBe(true);

    // A plugin-built World arrives in review, and remembers who built it and from where.
    const meta = loadPack("northwind-mcp").meta;
    expect(meta.id).toBe("northwind-mcp"); // withPackId stamped the new id
    expect(meta.status).toBe("draft");
    // `client` is whatever the connecting client puts in the request envelope — covered by the
    // `clientLabel` unit tests below; this frame carries none.
    expect(meta.built_by).toMatchObject({ source: "plugin", token, repo: "github.com/nw/bot@a1b2c3d" });
  });

  it("create_world refuses files that do not validate, and writes nothing", async () => {
    const token = issueToken().token;
    const init = await initialize();
    const broken = { ...northwindFiles, "tools.yaml": `${northwindFiles["tools.yaml"]}\nbroken:\n  system: nope\n` };

    const res = await call(init.sessionId, "create_world", { token, worldId: "nw-broken", files: broken });
    expect(res.result.isError).toBe(true);
    const body = JSON.parse(textOf(res.result)) as { valid: boolean; errors: string[]; fix: string };
    expect(body.valid).toBe(false);
    expect(body.errors.join(" ")).toContain("tools.yaml");
    expect(body.fix).toContain("Nothing was written");
    expect(existsSync(path.join(packsDir(), "nw-broken"))).toBe(false);
  });

  it("create_world refuses a token AgentSim never issued", async () => {
    const init = await initialize();
    const res = await call(init.sessionId, "create_world", { token: "wb_deadbeef", worldId: "nw-unauthorised", files: northwindFiles });
    expect(res.result.isError).toBe(true);
    expect(textOf(res.result)).toContain("not one AgentSim issued");
    expect(existsSync(path.join(packsDir(), "nw-unauthorised"))).toBe(false);
  });

  it("create_world on a taken id creates the next free one rather than overwriting", async () => {
    const init = await initialize();
    const res = await call(init.sessionId, "create_world", { token: issueToken().token, worldId: "northwind", files: northwindFiles });
    expect(res.result.isError).toBeFalsy();
    const { worldId, note } = JSON.parse(textOf(res.result)) as { worldId: string; note?: string };
    expect(worldId).toBe("northwind-2");
    expect(note).toContain("was taken");
    expect(loadPack("northwind").meta.status).toBe("ready"); // the installed World is untouched
  });

  it("rejects an invalid worldId before touching the filesystem", async () => {
    const init = await initialize();
    const res = await call(init.sessionId, "create_world", { token: issueToken().token, worldId: "Not Valid!", files: northwindFiles });
    expect(res.result.isError).toBe(true);
    expect(existsSync(path.join(packsDir(), "Not Valid!"))).toBe(false);
  });

  describe("a token owns one World", () => {
    it("writes a second create over the same World instead of making another", async () => {
      const token = issueToken().token;
      const init = await initialize();

      const first = await call(init.sessionId, "create_world", { token, worldId: "nw-owned", files: northwindFiles });
      expect(JSON.parse(textOf(first.result)).worldId).toBe("nw-owned");

      // A different requested id, the same token: the World it owns is what gets written.
      const second = await call(init.sessionId, "create_world", { token, worldId: "nw-somewhere-else", files: northwindFiles });
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

      const created = await call(init.sessionId, "create_world", { token, worldId: "nw-publishing", files: northwindFiles });
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

      const blocked = await call(init.sessionId, "create_world", { token, worldId: "nw-publishing", files: northwindFiles });
      expect(blocked.result.isError).toBe(true);
      expect(textOf(blocked.result)).toContain("rotated");
      expect(existsSync(path.join(packsDir(), "nw-publishing-2"))).toBe(false); // and it created nothing
    });
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
