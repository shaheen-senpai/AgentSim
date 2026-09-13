import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { DiffEntry } from "@/sim/diff";
import type { Score, Violation } from "@/sim/evaluator";
import type { Attack } from "@/sim/scenario";
import type { Event, Snapshot } from "@/sim/types";
import type { AgentVersion } from "./agents";

export type RunStatus = "running" | "completed" | "failed";
export type RunAgent = AgentVersion | "byo";

export type RunRecord = {
  id: string;
  createdAt: string;
  status: RunStatus;
  scenarioId: string;
  scenarioTitle: string;
  agent: RunAgent;
  attack: Attack | null;
  model: string | null;
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
};

export type RunSummary = Pick<RunRecord, "id" | "createdAt" | "status" | "scenarioId" | "agent"> & {
  attackId: string | null;
  headline: number | null;
  capped: boolean;
  golden: boolean;
};

export const dataDir = () => process.env.AGENTSIM_DATA_DIR ?? path.join(process.cwd(), "data");
const runsDir = () => path.join(dataDir(), "runs");
const goldenDir = () => path.join(dataDir(), "golden");

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
  mkdirSync(runsDir(), { recursive: true });
  const tmpFile = path.join(runsDir(), `${run.id}.json.tmp`);
  const finalFile = path.join(runsDir(), `${run.id}.json`);
  writeFileSync(tmpFile, JSON.stringify(run));
  renameSync(tmpFile, finalFile);
}

export function loadRun(id: string): RunRecord | null {
  if (!/^run_[a-z0-9]+$/.test(id)) return null;
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
  return { id: r.id, createdAt: r.createdAt, status: r.status, scenarioId: r.scenarioId, agent: r.agent, attackId: r.attack?.id ?? null, headline: r.score?.headline ?? null, capped: r.score?.capped ?? false, golden };
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
