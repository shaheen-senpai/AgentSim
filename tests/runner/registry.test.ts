import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createGateway } from "@/engine/gateway";
import { loadPack, type WorldPack } from "@/engine/pack";
import { seedWorld, snapshot } from "@/engine/world";
import { armIdle, getLive, registerLive, touchIdle, unregisterLive } from "@/runner/registry";
import { newRunId, type RunRecord } from "@/runner/store";
import { copyFixturePacks } from "../helpers/packs";

let pack: WorldPack;

function record(): RunRecord {
  return {
    id: newRunId(), createdAt: new Date().toISOString(), status: "running",
    packId: pack.meta.id, packName: pack.meta.name, scenarioId: "duplicate-charge-refund", scenarioTitle: "Dup",
    agent: { kind: "byo", agentId: null, name: "BYO agent", shape: "mcp", toolAliases: {} },
    attack: null, taskBrief: "brief", startSnapshot: snapshot(seedWorld(pack)), endSnapshot: null,
    events: [], violations: [], score: null, diff: null, unchangedCount: null,
    usage: { inputTokens: 0, outputTokens: 0 }, durationMs: null, cappedOut: false, truncated: false,
    transcript: [], error: null, narrative: null, idleTimeoutMs: null, finishedBy: null,
  };
}

beforeAll(() => { copyFixturePacks(); pack = loadPack("northwind"); });
afterEach(() => { vi.useRealTimers(); });

describe("registry", () => {
  it("holds live Runs on globalThis and forgets them", () => {
    const run = record();
    const gateway = createGateway(pack, seedWorld(pack));
    registerLive(run.id, gateway, run, pack);
    expect(getLive(run.id)?.gateway).toBe(gateway);
    expect(getLive(run.id)?.run).toBe(run);
    expect(getLive(run.id)?.pack).toBe(pack);
    unregisterLive(run.id);
    expect(getLive(run.id)).toBeUndefined();
  });

  it("fires an armed idle timer once, after the full interval", () => {
    vi.useFakeTimers();
    const run = record();
    registerLive(run.id, createGateway(pack, seedWorld(pack)), run, pack);
    const fired = vi.fn();
    armIdle(run.id, 1000, fired);

    vi.advanceTimersByTime(999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(5000);
    expect(fired).toHaveBeenCalledTimes(1);
    unregisterLive(run.id);
  });

  it("touchIdle restarts the timer with the same interval", () => {
    vi.useFakeTimers();
    const run = record();
    registerLive(run.id, createGateway(pack, seedWorld(pack)), run, pack);
    const fired = vi.fn();
    armIdle(run.id, 1000, fired);

    vi.advanceTimersByTime(900);
    touchIdle(run.id);
    vi.advanceTimersByTime(900);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fired).toHaveBeenCalledTimes(1);
    unregisterLive(run.id);
  });

  it("unregisterLive clears a pending idle timer", () => {
    vi.useFakeTimers();
    const run = record();
    registerLive(run.id, createGateway(pack, seedWorld(pack)), run, pack);
    const fired = vi.fn();
    armIdle(run.id, 1000, fired);

    unregisterLive(run.id);
    vi.advanceTimersByTime(5000);
    expect(fired).not.toHaveBeenCalled();
  });

  it("registerLive clears a displaced entry's idle timer instead of orphaning it", () => {
    vi.useFakeTimers();
    const run = record();
    registerLive(run.id, createGateway(pack, seedWorld(pack)), run, pack);
    const fired = vi.fn();
    armIdle(run.id, 1000, fired);

    // Something re-registers the same Run id (e.g. a dev-server module reload) before the timer fires.
    registerLive(run.id, createGateway(pack, seedWorld(pack)), run, pack);

    vi.advanceTimersByTime(5000);
    expect(fired).not.toHaveBeenCalled();
    unregisterLive(run.id);
  });

  it("ignores arming and touching a Run that is not live", () => {
    vi.useFakeTimers();
    const fired = vi.fn();
    expect(() => armIdle("run_gone", 1000, fired)).not.toThrow();
    expect(() => touchIdle("run_gone")).not.toThrow();
    vi.advanceTimersByTime(5000);
    expect(fired).not.toHaveBeenCalled();
  });
});
