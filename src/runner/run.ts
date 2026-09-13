import { applyAttack } from "@/sim/attack";
import { diffWorld, unchangedCount } from "@/sim/diff";
import { evaluate } from "@/sim/evaluator";
import { buildTaskBrief, loadScenario, loadSeed } from "@/sim/scenario";
import { createSim, type Sim } from "@/sim/sim";
import type { Event } from "@/sim/types";
import { seedWorld, snapshot } from "@/sim/world";
import { REFERENCE_AGENT_MODEL } from "./agents";
import { getLive, registerLive, unregisterLive } from "./registry";
import { driveReferenceAgent } from "./referenceAgent";
import type { AgentVersion } from "./agents";
import { loadRun, newRunId, saveRun, type RunAgent, type RunRecord } from "./store";

export type CreateRunOptions = { scenarioId: string; agent: RunAgent; attackId?: string | null };
export type FinishPatch = Partial<Pick<RunRecord, "usage" | "transcript" | "cappedOut" | "truncated" | "error">>;

/** Seed → Attack → start Snapshot → persist "running" → register live. Events are persisted as they happen. */
export function createRun(opts: CreateRunOptions, onEvent?: (e: Event) => void): { run: RunRecord; sim: Sim } {
  const scenario = loadScenario(opts.scenarioId);
  const attack = opts.attackId ? scenario.attacks.find((a) => a.id === opts.attackId) : null;
  if (opts.attackId && !attack) throw new Error(`Unknown attack ${opts.attackId} in ${scenario.id}`);

  const world = seedWorld(loadSeed(scenario.seed));
  if (attack) applyAttack(world, attack);

  const run: RunRecord = {
    id: newRunId(),
    createdAt: new Date().toISOString(),
    status: "running",
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    agent: opts.agent,
    attack: attack ?? null,
    model: opts.agent === "byo" ? null : REFERENCE_AGENT_MODEL,
    taskBrief: buildTaskBrief(scenario),
    startSnapshot: snapshot(world),
    endSnapshot: null,
    events: [],
    violations: [],
    score: null,
    diff: null,
    unchangedCount: null,
    usage: { inputTokens: 0, outputTokens: 0 },
    durationMs: null,
    cappedOut: false,
    truncated: false,
    transcript: [],
    error: null,
    narrative: null,
  };

  const sim: Sim = createSim(world, (e) => {
    run.events = [...sim.events];
    saveRun(run);
    onEvent?.(e);
  });

  saveRun(run);
  registerLive(run.id, sim, run);
  return { run, sim };
}

/** End Snapshot → Evaluator → diff → persist "completed" (or "failed") → unregister. */
export function finishRun(id: string, patch: FinishPatch = {}): RunRecord {
  const live = getLive(id);
  if (!live) throw new Error(`Run ${id} is not live (already finished, or lost on server restart)`);
  const { run, sim } = live;

  const scenario = loadScenario(run.scenarioId);
  const end = snapshot(sim.world);
  const { violations, score } = evaluate({ scenario, attack: run.attack, start: run.startSnapshot, end, events: sim.events });

  const done: RunRecord = {
    ...run,
    ...patch,
    status: patch.error ? "failed" : "completed",
    endSnapshot: end,
    events: [...sim.events],
    violations,
    score,
    diff: diffWorld(run.startSnapshot, end),
    unchangedCount: unchangedCount(run.startSnapshot, end),
    durationMs: Date.now() - Date.parse(run.createdAt),
  };
  saveRun(done);
  unregisterLive(id);
  return done;
}

/** Create the Run and return its id at once; the Reference Agent runs in the background of this Node process. */
export function startRun(opts: CreateRunOptions): string {
  const { run, sim } = createRun(opts);
  if (opts.agent === "byo") return run.id; // finished from the UI via POST /api/runs/:id/finish

  const agent: AgentVersion = opts.agent;
  void (async () => {
    try {
      const result = await driveReferenceAgent(sim, agent, run.taskBrief, (usage) => {
        run.usage = usage;
        saveRun(run);
      });
      finishRun(run.id, { usage: result.usage, transcript: result.transcript, cappedOut: result.cappedOut, truncated: result.truncated });
    } catch (e) {
      failRun(run.id, e instanceof Error ? e.message : String(e));
    }
  })();
  return run.id;
}

/** Mark a Run failed even when it is no longer live (e.g. the registry was dropped on a dev-server reload). */
export function failRun(id: string, message: string): void {
  try {
    finishRun(id, { error: message });
  } catch {
    const stale = loadRun(id);
    if (stale && stale.status === "running") {
      saveRun({ ...stale, status: "failed", error: message, durationMs: Date.now() - Date.parse(stale.createdAt) });
    }
  }
}
