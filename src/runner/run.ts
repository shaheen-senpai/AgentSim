import { applyAttack } from "@/engine/attack";
import { diffWorld, unchangedCount } from "@/engine/diff";
import { evaluate } from "@/engine/evaluator";
import { createGateway, type Gateway } from "@/engine/gateway";
import { buildTaskBrief, loadPack, type Scenario, type WorldPack } from "@/engine/pack";
import type { Event } from "@/engine/types";
import { seedWorld, snapshot } from "@/engine/world";
import { REFERENCE_AGENT_MODEL } from "./agents";
import { armIdle, getLive, registerLive, touchIdle, unregisterLive } from "./registry";
import { driveReferenceAgent } from "./referenceAgent";
import { loadRun, newRunId, saveRun, type AgentShape, type FinishedBy, type RunAgentRef, type RunRecord } from "./store";

/** A BYO Run with no explicit timeout finishes itself two minutes after its last Event. */
export const BYO_DEFAULT_IDLE_MS = 120_000;

export type CreateRunOptions = {
  packId: string;
  scenarioId: string;
  attackId?: string | null;
  agent:
    | { kind: "reference"; version: string }
    | { kind: "byo"; agentId?: string | null; name?: string; shape?: AgentShape; toolAliases?: Record<string, string> };
  idleTimeoutMs?: number | null;
};

export type FinishPatch = Partial<Pick<RunRecord, "usage" | "transcript" | "cappedOut" | "truncated" | "error">>;

function agentRef(agent: CreateRunOptions["agent"]): RunAgentRef {
  if (agent.kind === "reference") return { kind: "reference", version: agent.version, model: REFERENCE_AGENT_MODEL };
  return {
    kind: "byo",
    agentId: agent.agentId ?? null,
    name: agent.name ?? "BYO agent",
    shape: agent.shape ?? "mcp",
    toolAliases: agent.toolAliases ?? {},
  };
}

function scenarioOf(pack: WorldPack, scenarioId: string): Scenario {
  const scenario = pack.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) throw new Error(`Unknown scenario ${scenarioId} in pack ${pack.meta.id}`);
  return scenario;
}

/** Pack → seed → Attack → start Snapshot → persist "running" → register live → arm the idle timer. Events are persisted as they happen. */
export function createRun(opts: CreateRunOptions, onEvent?: (e: Event) => void): { run: RunRecord; gateway: Gateway } {
  const pack = loadPack(opts.packId);
  const scenario = scenarioOf(pack, opts.scenarioId);
  const attack = opts.attackId ? scenario.attacks.find((a) => a.id === opts.attackId) : null;
  if (opts.attackId && !attack) throw new Error(`Unknown attack ${opts.attackId} in ${scenario.id}`);

  const world = seedWorld(pack);
  if (attack) applyAttack(pack, world, attack);

  const agent = agentRef(opts.agent);
  const run: RunRecord = {
    id: newRunId(),
    createdAt: new Date().toISOString(),
    status: "running",
    packId: pack.meta.id,
    packName: pack.meta.name,
    scenarioId: scenario.id,
    scenarioTitle: scenario.title,
    agent,
    attack: attack ?? null,
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
    // A Reference Run is driven to completion in-process, so it never idles out.
    idleTimeoutMs: agent.kind === "reference" ? null : opts.idleTimeoutMs === undefined ? BYO_DEFAULT_IDLE_MS : opts.idleTimeoutMs,
    finishedBy: null,
  };

  const gateway = createGateway(pack, world, {
    attack,
    onEvent: (e) => {
      if (!getLive(run.id)) return; // the Run already finished; a stray post-finish Event must not resurrect it
      run.events = [...gateway.events];
      saveRun(run);
      touchIdle(run.id);
      onEvent?.(e);
    },
  });

  saveRun(run);
  registerLive(run.id, gateway, run, pack);
  if (run.idleTimeoutMs !== null) {
    armIdle(run.id, run.idleTimeoutMs, () => {
      if (!getLive(run.id)) return; // already finished between the timer firing and this callback
      try {
        finishRun(run.id, { finishedBy: "idle_timeout" });
      } catch (e) {
        // A throw inside a timer callback would take the server down; record the Run as failed instead.
        failRun(run.id, e instanceof Error ? e.message : String(e));
      }
    });
  }
  return { run, gateway };
}

/** End Snapshot → Evaluator → diff → persist "completed" (or "failed") → unregister. */
export function finishRun(id: string, patch: FinishPatch & { finishedBy?: FinishedBy } = {}): RunRecord {
  const live = getLive(id);
  if (!live) throw new Error(`Run ${id} is not live (already finished, or lost on server restart)`);
  const { run, gateway, pack } = live;

  // A throw anywhere below (evaluate, diffWorld, saveRun, ...) must not leave a zombie live entry
  // that a later tool call could revive — unregister no matter how this returns.
  try {
    const scenario = scenarioOf(pack, run.scenarioId);
    const end = snapshot(gateway.world);
    // A Run that threw or ran out its idle timer did not stop of its own accord — the Evaluator
    // needs that to tell a deliberate refusal from an agent that simply died.
    const errored = Boolean(patch.error) || patch.finishedBy === "idle_timeout";
    const { violations, score } = evaluate({ pack, scenario, attack: run.attack, start: run.startSnapshot, end, events: gateway.events, errored });

    const { finishedBy, ...rest } = patch;
    const done: RunRecord = {
      ...run,
      ...rest,
      status: patch.error ? "failed" : "completed",
      endSnapshot: end,
      events: [...gateway.events],
      violations,
      score,
      diff: diffWorld(pack, run.startSnapshot, end),
      unchangedCount: unchangedCount(pack, run.startSnapshot, end),
      durationMs: Date.now() - Date.parse(run.createdAt),
      finishedBy: finishedBy ?? (patch.error ? "error" : "user"),
    };
    saveRun(done);
    return done;
  } finally {
    unregisterLive(id);
  }
}

/** Create the Run and return its id at once; the Reference Agent runs in the background of this Node process. */
export function startRun(opts: CreateRunOptions): string {
  const { run, gateway } = createRun(opts);
  if (run.agent.kind === "byo") return run.id; // finished from the UI via POST /api/runs/:id/finish, or by the idle timer

  const pack = getLive(run.id)!.pack;
  const version = run.agent.version;
  void (async () => {
    try {
      const result = await driveReferenceAgent(gateway, pack, version, run.taskBrief, (usage) => {
        run.usage = usage;
        saveRun(run);
      });
      finishRun(run.id, { usage: result.usage, transcript: result.transcript, cappedOut: result.cappedOut, truncated: result.truncated, finishedBy: "agent" });
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
      saveRun({ ...stale, status: "failed", error: message, finishedBy: "error", durationMs: Date.now() - Date.parse(stale.createdAt) });
    }
  }
}
