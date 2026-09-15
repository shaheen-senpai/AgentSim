// `POST /api/runs/:id/narrative` is the one route on the Run page that spends money, and it used to
// run for any completed Run it could load — golden ones included, since `loadRun` falls through to
// `data/golden/`. It then called `saveRun`, which always writes `data/runs/`, which `loadRun` reads
// *first*: from that moment the golden id resolved to a mutated copy and "replaying a golden Run
// makes no model calls / byte-for-byte reproducible" was quietly false on that machine.
//
// The only guard was client-side (`RunView`), and it depended on the Run appearing in the `recent`
// array the page was handed. These tests pin the server-side rule. Nothing here can reach the
// Anthropic API: every case either refuses before `writeNarrative` or has a narrative already.
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { POST as narrativeRoute } from "@/app/api/runs/[id]/narrative/route";
import { loadPack } from "@/engine/pack";
import { seedWorld, snapshot } from "@/engine/world";
import { REFERENCE_AGENT_MODEL } from "@/runner/agents";
import { isGoldenRun, loadRun, newRunId, saveRun, type RunRecord } from "@/runner/store";
import { usePacksDir } from "../helpers/packs";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const post = (id: string) => new Request(`http://localhost/api/runs/${id}/narrative`, { method: "POST" });

let dataDir: string;

function record(over: Partial<RunRecord> = {}): RunRecord {
  const pack = loadPack("northwind");
  return {
    id: newRunId(), createdAt: new Date().toISOString(), status: "completed",
    packId: pack.meta.id, packName: pack.meta.name,
    scenarioId: "duplicate-charge-refund", scenarioTitle: "Dup",
    agent: { kind: "reference", version: "naive", model: REFERENCE_AGENT_MODEL },
    attack: null, taskBrief: "brief", startSnapshot: snapshot(seedWorld(pack)), endSnapshot: null,
    events: [], violations: [], score: null, diff: null, unchangedCount: null,
    usage: { inputTokens: 0, outputTokens: 0 }, durationMs: null, cappedOut: false, truncated: false,
    transcript: [], error: null, narrative: null, idleTimeoutMs: null, finishedBy: "agent", ...over,
  };
}

/** Writes a record straight into `data/golden/`, the way `npm run promote:golden` does. */
function promote(run: RunRecord): RunRecord {
  mkdirSync(path.join(dataDir, "golden"), { recursive: true });
  writeFileSync(path.join(dataDir, "golden", `${run.id}.json`), JSON.stringify(run));
  return run;
}

const runsFile = (id: string) => path.join(dataDir, "runs", `${id}.json`);

beforeAll(() => {
  usePacksDir();
  dataDir = mkdtempSync(path.join(os.tmpdir(), "agentsim-narrative-"));
  process.env.AGENTSIM_DATA_DIR = dataDir;
});

describe("POST /api/runs/:id/narrative", () => {
  it("refuses a golden Run, spends nothing, and writes no file into data/runs", async () => {
    const golden = promote(record());
    expect(isGoldenRun(golden.id)).toBe(true);

    const res = await narrativeRoute(post(golden.id), ctx(golden.id));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/golden/i);

    expect(existsSync(runsFile(golden.id))).toBe(false);
    expect(loadRun(golden.id)!.narrative).toBeNull(); // still the promoted record, byte for byte
  });

  it("refuses a BYO Run — narratives are for Reference Agent Runs", async () => {
    const byo = record({ agent: { kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} } });
    saveRun(byo);
    const res = await narrativeRoute(post(byo.id), ctx(byo.id));
    expect(res.status).toBe(409);
    expect(loadRun(byo.id)!.narrative).toBeNull();
  });

  it("still 409s a Run that is not finished, and 409s an unknown id", async () => {
    const running = record({ status: "running", finishedBy: null });
    saveRun(running);
    expect((await narrativeRoute(post(running.id), ctx(running.id))).status).toBe(409);
    expect((await narrativeRoute(post("run_nope"), ctx("run_nope"))).status).toBe(409);
  });

  it("returns an already-written narrative without calling the model", async () => {
    const done = record({ narrative: "It refunded the duplicate charge and stopped there." });
    saveRun(done);
    const res = await narrativeRoute(post(done.id), ctx(done.id));
    expect(res.status).toBe(200);
    expect((await res.json()) as { narrative: string }).toEqual({ narrative: "It refunded the duplicate charge and stopped there." });
  });
});

describe("saveRun", () => {
  it("refuses any write to an id that exists under data/golden — the shadowing footgun is broader than narratives", () => {
    const golden = promote(record({ narrative: null }));
    expect(() => saveRun({ ...golden, narrative: "rewritten" })).toThrow(/golden/i);
    expect(existsSync(runsFile(golden.id))).toBe(false);
    expect(loadRun(golden.id)!.narrative).toBeNull();
  });

  it("still writes a Run that is not golden", () => {
    const ordinary = record();
    saveRun(ordinary);
    expect(existsSync(runsFile(ordinary.id))).toBe(true);
    expect(isGoldenRun(ordinary.id)).toBe(false);
  });
});
