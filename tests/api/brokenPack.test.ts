// One World pack hand-edited into an invalid state must not take a list-shaped route down with it.
//
// This mirrors the resilience test in `tests/api/worlds.test.ts` ("GET /api/worlds resilience"),
// which covered only `GET /api/worlds`. `/`, `/runs/:id` and `GET /api/scenarios` each carried their
// own copy of `listPackIds().map((id) => toPackOption(loadPack(id)))` with no `try`, so a broken
// pack 500'd the home page and every Run page — the two routes on the demo's critical path, and the
// two you need working to reach `/worlds/:id`, which exists precisely to *fix* a broken pack.
//
// Every route below now reads packs through `loadPacks` in `src/lib/summaries.ts`. Server
// components are called as plain functions: they build their props (which is where the throw was)
// and return a React element without rendering, which is all this needs to prove.
import { cpSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as scenariosRoute } from "@/app/api/scenarios/route";
import { GET as listWorldsRoute } from "@/app/api/worlds/route";
import ConnectRoute from "@/app/connect/page";
import Home from "@/app/page";
import RunRoute from "@/app/runs/[id]/page";
import WorldsPage from "@/app/worlds/page";
import { listPackIds } from "@/engine/pack";
import type { ScenarioSummary } from "@/lib/summaries";
import { createRun, finishRun } from "@/runner/run";
import { usePacksDir } from "../helpers/packs";

const NORTHWIND = { packId: "northwind", scenarioId: "duplicate-charge-refund" } as const;

let packsDir: string;
let runId: string;
let warn: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  packsDir = usePacksDir("northwind");
  process.env.AGENTSIM_DATA_DIR = mkdtempSync(path.join(os.tmpdir(), "agentsim-brokenpack-"));

  // A finished Run to open `/runs/:id` with — created while the packs dir is still healthy.
  const { run } = createRun({ ...NORTHWIND, idleTimeoutMs: null, agent: { kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} } });
  runId = run.id;
  finishRun(runId);

  // Now break a second pack behind the API's back, exactly as a hand edit would.
  cpSync(path.join(process.cwd(), "worldpacks", "northwind"), path.join(packsDir, "rotten"), { recursive: true });
  writeFileSync(path.join(packsDir, "rotten", "pack.yaml"), "id: rotten\nname: [unclosed", "utf8");

  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterAll(() => {
  warn.mockRestore();
});

describe("a World pack that no longer loads", () => {
  it("is installed, so it is still reachable at /worlds/:id to be fixed", () => {
    expect(listPackIds()).toContain("rotten");
  });

  it("does not 500 GET /api/scenarios, and the good pack's Scenarios still come back", async () => {
    const res = await scenariosRoute(new Request("http://localhost/api/scenarios"));
    expect(res.status).toBe(200);
    const summaries = (await res.json()) as ScenarioSummary[];
    expect(summaries.map((s) => s.packId)).toContain("northwind");
    expect(summaries.map((s) => s.packId)).not.toContain("rotten");
    expect(summaries.find((s) => s.packId === "northwind")?.id).toBe("duplicate-charge-refund");
    expect(warn).toHaveBeenCalled();
  });

  it("does not 500 GET /api/scenarios?packId= for the good pack", async () => {
    const res = await scenariosRoute(new Request("http://localhost/api/scenarios?packId=northwind"));
    expect(res.status).toBe(200);
    expect((await res.json()) as ScenarioSummary[]).toHaveLength(1);
  });

  it("still 404s an unknown packId", async () => {
    expect((await scenariosRoute(new Request("http://localhost/api/scenarios?packId=nope"))).status).toBe(404);
  });

  it("does not 500 the home page", () => {
    expect(() => Home()).not.toThrow();
  });

  it("does not 500 a Run page", async () => {
    await expect(RunRoute({ params: Promise.resolve({ id: runId }) })).resolves.toBeTruthy();
  });

  it("does not 500 /worlds or /connect, which were already guarded", () => {
    expect(() => WorldsPage()).not.toThrow();
    expect(() => ConnectRoute()).not.toThrow();
  });

  it("does not 500 GET /api/worlds", async () => {
    const res = await listWorldsRoute();
    expect(res.status).toBe(200);
    expect(((await res.json()) as { id: string }[]).map((p) => p.id)).toEqual(["northwind"]);
  });
});
