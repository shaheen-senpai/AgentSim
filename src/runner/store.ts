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
  /** Copied from the record so a list row never needs the pack loaded. */
  packName: string;
  scenarioTitle: string;
  agentLabel: string;
  agentKind: "reference" | "byo";
  /** The registry id of a BYO agent, so the workspace can roll runs up per agent; null for Reference runs. */
  agentId?: string | null;
  attackId: string | null;
  headline: number | null;
  capped: boolean;
  /** null for a Run with no Score yet, or a v1 record predating the Outcome. */
  outcome: Outcome | null;
  /** Whether the Run met the bar its Scenario set. False for a Run with no Score yet. */
  passed: boolean;
  golden: boolean;
  dimensions: DimensionScore[];
  /** Whether a `lure_not_taken` Violation exists — the Run performed the Attack's Lure. */
  lureTaken: boolean;
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

/**
 * A v1 record still on disk (pre-`packId`, Events without `startedAt`/`endedAt`/`batchId`/
 * `injected`/`source`) is given the v2 shape every reader assumes. `scripts/migrate-runs.ts` is the
 * real migration; this only stops a stale file from rendering every Event as injected and every
 * call as one wave. The Score and the rest of the record are left exactly as stored.
 */
export function normalizeRun(run: RunRecord): RunRecord {
  // v1 `agent` was a bare version string; v1 attacks used `append_to_email`; v1 scores predate
  // `passed`/`outcome`. The defaults below are the evaluator's own rules for a record with no
  // Violations recorded against a threshold: a pass is no cap and every Dimension at 100.
  const agentRaw = run.agent as unknown;
  const agent: RunAgentRef =
    typeof agentRaw === "string"
      ? agentRaw === "byo"
        ? { kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} }
        : { kind: "reference", version: agentRaw, model: (run as { model?: string }).model ?? "claude-haiku-4-5" }
      : run.agent;
  type V1Mutation = { type: "append_to_email"; email: string; text: string };
  const attackRaw = run.attack as (Omit<Attack, "mutation"> & { mutation: Attack["mutation"] | V1Mutation }) | null;
  const attack: Attack | null =
    attackRaw && attackRaw.mutation.type === "append_to_email"
      ? { ...attackRaw, mutation: { type: "append_to_field", collection: "emails", id: attackRaw.mutation.email, field: "body", text: attackRaw.mutation.text } }
      : (attackRaw as Attack | null);
  const score = run.score
    ? {
        ...run.score,
        passed: run.score.passed ?? (!run.score.capped && run.score.dimensions.every((d) => d.score >= 100)),
        passReason: run.score.passReason ?? null,
        outcome: run.score.outcome ?? ((run.violations ?? []).length === 0 ? "completed" : "violated"),
        outcomeReason: run.score.outcomeReason ?? null,
      }
    : run.score;
  const events = (run.events ?? []).map((e) => ({
    ...e,
    startedAt: e.startedAt ?? e.at,
    endedAt: e.endedAt ?? e.at,
    batchId: e.batchId ?? null,
    injected: e.injected ?? null,
    source: e.source ?? "reference",
    // v1 stored bare entity ids; the collection is only recoverable with the pack (the migration does that).
    changes: (e.changes ?? []).map((c) => (typeof c === "string" ? { collection: "", id: c, op: "update" as const } : c)),
  }));
  return { ...run, agent, attack, score, events, violations: run.violations ?? [], transcript: run.transcript ?? [] };
}

function readRunFile(file: string): RunRecord | null {
  try {
    return normalizeRun(JSON.parse(readFileSync(file, "utf8")) as RunRecord);
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
    packName: r.packName ?? "",
    scenarioId: r.scenarioId,
    scenarioTitle: r.scenarioTitle ?? r.scenarioId,
    agentLabel: agentLabel(r.agent),
    agentKind: agentKind(r.agent),
    agentId: r.agent?.kind === "byo" ? (r.agent.agentId ?? null) : null,
    attackId: r.attack?.id ?? null,
    headline: r.score?.headline ?? null,
    capped: r.score?.capped ?? false,
    outcome: r.score?.outcome ?? null,
    passed: r.score?.passed ?? false,
    golden,
    dimensions: r.score?.dimensions ?? [],
    lureTaken: (r.violations ?? []).some((v) => v.checkType === "lure_not_taken"),
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
