import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DiffEntry } from "@/engine/diff";
import type { DimensionScore, Outcome, Score, Violation } from "@/engine/evaluator";
import type { Attack } from "@/engine/pack";
import type { Event, Snapshot } from "@/engine/types";
import { agentKind, agentLabel, type AgentShape, type RunAgentRef } from "./agentRef";

// Re-exported so existing server-side imports of `AgentShape`/`RunAgentRef`/`agentLabel` from
// `store.ts` keep working. Client components must import `agentLabel`/`RunAgentRef` from
// `@/runner/agentRef` directly — this module pulls in `node:fs`.
export { agentKind, agentLabel };
export type { AgentShape, RunAgentRef };

export type RunStatus = "running" | "completed" | "failed";

export type FinishedBy = "agent" | "user" | "idle_timeout" | "error";

export type RunRecord = {
  id: string;
  createdAt: string;
  status: RunStatus;
  packId: string;
  packName: string;
  scenarioId: string;
  scenarioTitle: string;
  agent: RunAgentRef;
  attack: Attack | null;
  taskBrief: string;
  startSnapshot: Snapshot;
  endSnapshot: Snapshot | null;
  events: Event[];
  violations: Violation[];
  score: Score | null;
  diff: DiffEntry[] | null;
  unchangedCount: number | null;
  usage: { inputTokens: number; outputTokens: number };
  durationMs: number | null;
  cappedOut: boolean;
  truncated: boolean;
  transcript: unknown[];
  error: string | null;
  narrative: string | null;
  idleTimeoutMs: number | null;
  finishedBy: FinishedBy | null;
};

export type RunSummary = Pick<RunRecord, "id" | "createdAt" | "status" | "packId" | "scenarioId"> & {
  agentLabel: string;
  agentKind: "reference" | "byo";
  attackId: string | null;
  headline: number | null;
  capped: boolean;
  /** null for a Run with no Score yet, or a v1 record predating the Outcome. */
  outcome: Outcome | null;
  /** Whether the Run met the bar its Scenario set. False for a Run with no Score yet. */
  passed: boolean;
  golden: boolean;
  dimensions: DimensionScore[];
};

export const dataDir = () => process.env.AGENTSIM_DATA_DIR ?? path.join(process.cwd(), "data");
const runsDir = () => path.join(dataDir(), "runs");
export const goldenDir = () => path.join(dataDir(), "golden");

export const RUN_ID_RE = /^run_[a-z0-9]+$/;

/**
 * Whether `id` names a golden Run — a recorded, byte-for-byte reproducible demo record under
 * `data/golden/`. It is the guard behind `saveRun`: `loadRun` reads `data/runs/` *first*, so a
 * write of a golden id lands in `data/runs/` and from then on shadows the record it came from,
 * quietly ending "replaying a golden Run makes no model calls" on that machine. Promotion
 * (`scripts/promote-golden.ts`) copies the file directly and is unaffected.
 */
export function isGoldenRun(id: string): boolean {
  return RUN_ID_RE.test(id) && existsSync(path.join(goldenDir(), `${id}.json`));
}

function readRunFile(file: string): RunRecord | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as RunRecord;
  } catch {
    console.warn(`[store] skipping unreadable run file ${file}`);
    return null;
  }
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function saveRun(run: RunRecord): void {
  if (isGoldenRun(run.id)) throw new Error(`Refusing to write Run ${run.id}: it is a golden Run, which data/runs/ would shadow`);
  mkdirSync(runsDir(), { recursive: true });
  const tmpFile = path.join(runsDir(), `${run.id}.json.tmp`);
  const finalFile = path.join(runsDir(), `${run.id}.json`);
  writeFileSync(tmpFile, JSON.stringify(run));
  renameSync(tmpFile, finalFile);
}

export function loadRun(id: string): RunRecord | null {
  if (!RUN_ID_RE.test(id)) return null;
  for (const dir of [runsDir(), goldenDir()]) {
    const file = path.join(dir, `${id}.json`);
    if (existsSync(file)) {
      const result = readRunFile(file);
      if (result !== null) return result;
      // If a file exists but is unreadable, don't fall through to golden
      if (dir === runsDir()) return null;
    }
  }
  return null;
}

export function toSummary(r: RunRecord, golden = false): RunSummary {
  return {
    id: r.id,
    createdAt: r.createdAt,
    status: r.status,
    packId: r.packId ?? "", // v1 records predate packs; Task 10 migrates them
    scenarioId: r.scenarioId,
    agentLabel: agentLabel(r.agent),
    agentKind: agentKind(r.agent),
    attackId: r.attack?.id ?? null,
    headline: r.score?.headline ?? null,
    capped: r.score?.capped ?? false,
    outcome: r.score?.outcome ?? null,
    passed: r.score?.passed ?? false,
    golden,
    dimensions: r.score?.dimensions ?? [],
  };
}

export function listRuns(scenarioId?: string): RunSummary[] {
  const goldenIds = new Set<string>();
  if (existsSync(goldenDir())) {
    for (const f of readdirSync(goldenDir()).filter((f) => f.endsWith(".json"))) {
      goldenIds.add(path.basename(f, ".json"));
    }
  }

  const seen = new Set<string>();
  const out: RunSummary[] = [];
  for (const dir of [runsDir(), goldenDir()]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
      const filePath = path.join(dir, f);
      const r = readRunFile(filePath);
      if (r === null) continue;
      if (seen.has(r.id) || (scenarioId && r.scenarioId !== scenarioId)) continue;
      seen.add(r.id);
      out.push(toSummary(r, goldenIds.has(r.id)));
    }
  }
  return out.sort((a, b) => (a.golden === b.golden ? b.createdAt.localeCompare(a.createdAt) : a.golden ? -1 : 1));
}
