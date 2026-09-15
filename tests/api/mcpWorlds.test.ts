// Smoke-tests /mcp/worlds over its real handler, the same way tests/api/mcp.test.ts does for
// /mcp/runs/:id. register_agent/refine_world call the real Anthropic client with no injected deps
// (same as POST /api/worlds/generate), so — matching how that route is already tested — this file
// never drives them past the missing-API-key guard; get_world_draft/create_world are exercised
// fully by seeding a draft directly through createDraft, which needs no model call at all.
import { existsSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST as mcpWorldsRoute } from "@/app/mcp/worlds/route";
import { loadPack, packsDir, type PackFiles } from "@/engine/pack";
import { createDraft } from "@/generate/draftRegistry";
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
  northwindFiles = loadPack("northwind").files; // real, valid files — seeding create_world needs no model call
});

afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe("/mcp/worlds", () => {
  it("hands the client instructions naming register_agent, and lists exactly the 4 tools", async () => {
    const init = await initialize();
    expect(init.status).toBe(200);
    expect(init.result.instructions as string).toContain("register_agent");

    const listed = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, init.sessionId);
    const names = (listed.result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toEqual(["register_agent", "refine_world", "get_world_draft", "create_world"]);
  });

  it("register_agent refuses to spend anything when ANTHROPIC_API_KEY is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const init = await initialize();
    const res = await call(init.sessionId, "register_agent", { name: "Acme Helpdesk", domain: "helpdesk", description: "An IT helpdesk." });
    expect(res.result.isError).toBe(true);
    expect(textOf(res.result)).toContain("ANTHROPIC_API_KEY");
  });

  it("get_world_draft renders a seeded draft's files and its validation state", async () => {
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "get_world_draft", { draftId: draft.id });
    expect(res.result.isError).toBeFalsy();
    expect(textOf(res.result)).toContain("pack.yaml");
    expect(textOf(res.result)).toContain("Valid");
  });

  it("create_world persists a seeded valid draft through the real POST /api/worlds path", async () => {
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "create_world", { draftId: draft.id, worldId: "northwind-mcp" });
    expect(res.result.isError).toBeFalsy();
    const { worldId, url } = JSON.parse(textOf(res.result)) as { worldId: string; url: string };
    expect(worldId).toBe("northwind-mcp");
    expect(url).toBe("/worlds/northwind-mcp");
    expect(existsSync(path.join(packsDir(), "northwind-mcp", "pack.yaml"))).toBe(true);
    expect(loadPack("northwind-mcp").meta.id).toBe("northwind-mcp"); // withPackId stamped the new id
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
    const draft = createDraft({ name: "Northwind", domain: "commerce", description: "d" }, { files: northwindFiles, errors: [], attempts: 1 });
    const init = await initialize();

    const res = await call(init.sessionId, "create_world", { draftId: draft.id, worldId: "Not Valid!" });
    expect(res.result.isError).toBe(true);
    expect(existsSync(path.join(packsDir(), "Not Valid!"))).toBe(false);
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
