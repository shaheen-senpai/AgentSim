import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFlow,
  groupWaves,
  COL_PITCH,
  JUNCTION,
  NODE_H,
  NODE_W,
  ROW_PITCH,
  type BuildFlowInput,
} from "@/ui/flow/buildFlow";
import type { Event } from "@/engine/types";
import type { Score, Violation } from "@/engine/evaluator";
import type { Attack } from "@/engine/pack";

/** A complete Event v2, seq-keyed so distinct events never collide by default. */
function ev(seq: number, overrides: Partial<Event> = {}): Event {
  return {
    seq,
    toolUseId: `call-${seq}`,
    tool: "orders.get",
    input: {},
    result: JSON.stringify({ ok: true }),
    isError: false,
    changes: [],
    startedAt: seq * 1000,
    endedAt: seq * 1000 + 500,
    at: seq * 1000 + 500,
    source: "reference",
    batchId: null,
    injected: null,
    ...overrides,
  };
}

const toolSystem = (tool: string): string | null => {
  if (tool.startsWith("orders.")) return "orders";
  if (tool.startsWith("email.")) return "email";
  return null;
};

const SCORE: Score = { headline: 90, capped: false, capReason: null, passed: false, passReason: "Correctness 50 is below this Scenario's threshold of 100", outcome: "violated", outcomeReason: null, dimensions: [] };

function baseInput(overrides: Partial<BuildFlowInput> = {}): BuildFlowInput {
  return {
    events: [],
    visible: Infinity,
    violations: [],
    attack: null,
    status: "completed",
    score: SCORE,
    toolSystem,
    ...overrides,
  };
}

function violation(seq: number | null, overrides: Partial<Violation> = {}): Violation {
  return { checkType: "arg_lte", dimension: "safety", params: {}, eventSeq: seq, message: "bad", magnitude: null, ...overrides };
}

// ─────────────────────────────── groupWaves ───────────────────────────────

describe("groupWaves", () => {
  it("puts sequential, non-overlapping, unbatched Events in their own wave each", () => {
    const events = [
      ev(1, { startedAt: 0, endedAt: 500 }),
      ev(2, { startedAt: 1000, endedAt: 1500 }),
      ev(3, { startedAt: 2000, endedAt: 2500 }),
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([
      { batchId: null, maxEndedAt: 500, seqs: [1] },
      { batchId: null, maxEndedAt: 1500, seqs: [2] },
      { batchId: null, maxEndedAt: 2500, seqs: [3] },
    ]);
  });

  it("groups Events sharing a batchId into one wave, regardless of timing", () => {
    const events = [
      ev(1, { batchId: "turn-1", startedAt: 0, endedAt: 500 }),
      ev(2, { batchId: "turn-1", startedAt: 600, endedAt: 1000 }),
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([{ batchId: "turn-1", maxEndedAt: 1000, seqs: [1, 2] }]);
  });

  it("groups Events that overlap in time even with batchId: null (the time rule, independent of batch)", () => {
    const events = [
      ev(1, { batchId: null, startedAt: 0, endedAt: 1000 }),
      ev(2, { batchId: null, startedAt: 400, endedAt: 1400 }), // starts before #1 finishes
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([{ batchId: null, maxEndedAt: 1400, seqs: [1, 2] }]);
  });

  it("does not join two null-batchId Events that do not overlap in time", () => {
    const events = [
      ev(1, { batchId: null, startedAt: 0, endedAt: 500 }),
      ev(2, { batchId: null, startedAt: 500, endedAt: 900 }), // starts exactly at #1's end: not "<"
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([
      { batchId: null, maxEndedAt: 500, seqs: [1] },
      { batchId: null, maxEndedAt: 900, seqs: [2] },
    ]);
  });

  it("keeps growing maxEndedAt from the wave's latest finish, not just the last member", () => {
    // #2 finishes later than #3 started but #3 still overlaps the wave's running maxEndedAt.
    const events = [
      ev(1, { batchId: "t1", startedAt: 0, endedAt: 2000 }),
      ev(2, { batchId: "t1", startedAt: 100, endedAt: 300 }),
      ev(3, { batchId: null, startedAt: 1500, endedAt: 2500 }), // 1500 < maxEndedAt(2000)
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([{ batchId: "t1", maxEndedAt: 2500, seqs: [1, 2, 3] }]);
  });

  it("does not re-merge a batchId that reappears after a gap — only the current wave is checked", () => {
    // A(t1), B(t2), C(t1): C shares a batchId with A, but A's wave is no longer "current" once B
    // has started its own — and there's no time overlap either (all non-overlapping) — so C must
    // start a third wave, not merge back into A's.
    const events = [
      ev(1, { batchId: "t1", startedAt: 0, endedAt: 500 }),
      ev(2, { batchId: "t2", startedAt: 1000, endedAt: 1500 }),
      ev(3, { batchId: "t1", startedAt: 2000, endedAt: 2500 }),
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([
      { batchId: "t1", maxEndedAt: 500, seqs: [1] },
      { batchId: "t2", maxEndedAt: 1500, seqs: [2] },
      { batchId: "t1", maxEndedAt: 2500, seqs: [3] },
    ]);
  });
});

// ─────────────────────────────── buildFlow: basic shape ───────────────────────────────

describe("buildFlow: sequential Events (no batch, no overlap)", () => {
  const events = [
    ev(1, { startedAt: 0, endedAt: 500 }),
    ev(2, { startedAt: 1000, endedAt: 1500 }),
    ev(3, { startedAt: 2000, endedAt: 2500 }),
  ];
  const { nodes, edges, waves } = buildFlow(baseInput({ events, status: "completed" }));

  it("produces one wave per Event and one node per wave (plus start/end)", () => {
    expect(waves.map((w) => w.seqs)).toEqual([[1], [2], [3]]);
    expect(nodes.map((n) => n.id)).toEqual(["start", "ev-1", "ev-2", "ev-3", "end"]);
    expect(nodes.every((n) => n.type !== "junction")).toBe(true);
  });

  it("connects every column directly, with no junctions", () => {
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["start", "ev-1"],
      ["ev-1", "ev-2"],
      ["ev-2", "ev-3"],
      ["ev-3", "end"],
    ]);
  });

  it("places nodes on the horizontal pitch, centred vertically", () => {
    const start = nodes.find((n) => n.id === "start")!;
    const e1 = nodes.find((n) => n.id === "ev-1")!;
    const e2 = nodes.find((n) => n.id === "ev-2")!;
    const e3 = nodes.find((n) => n.id === "ev-3")!;
    const end = nodes.find((n) => n.id === "end")!;
    expect(start.position).toEqual({ x: 40, y: -NODE_H / 2 });
    expect(e1.position).toEqual({ x: 40 + COL_PITCH * 1, y: -NODE_H / 2 });
    expect(e2.position).toEqual({ x: 40 + COL_PITCH * 2, y: -NODE_H / 2 });
    expect(e3.position).toEqual({ x: 40 + COL_PITCH * 3, y: -NODE_H / 2 });
    expect(end.position).toEqual({ x: 40 + COL_PITCH * 4, y: -NODE_H / 2 });
  });
});

describe("buildFlow: two Events sharing a batchId", () => {
  const events = [
    ev(1, { batchId: "turn-1", startedAt: 0, endedAt: 500, tool: "orders.get" }),
    ev(2, { batchId: "turn-1", startedAt: 0, endedAt: 500, tool: "email.send" }),
  ];
  const { nodes, edges, waves } = buildFlow(baseInput({ events, status: "completed" }));

  it("forms a single wave of two", () => {
    expect(waves).toEqual([{ batchId: "turn-1", maxEndedAt: 500, seqs: [1, 2] }]);
  });

  it("inserts a junction on both sides of the pair", () => {
    const junctions = nodes.filter((n) => n.type === "junction");
    expect(junctions.map((n) => n.id)).toEqual(["j-0", "j-1"]);
    expect(nodes.map((n) => n.id)).toEqual(["start", "j-0", "ev-1", "ev-2", "j-1", "end"]);
  });

  it("has the right edge count: 1 trunk + 2 fan-out + 2 fan-in + 1 trunk = 6", () => {
    expect(edges).toHaveLength(6);
    expect(edges.map((e) => [e.source, e.target])).toEqual(
      expect.arrayContaining([
        ["start", "j-0"],
        ["j-0", "ev-1"],
        ["j-0", "ev-2"],
        ["ev-1", "j-1"],
        ["ev-2", "j-1"],
        ["j-1", "end"],
      ]),
    );
  });

  it("positions the pair symmetrically about y=0 and the junctions at the exact formula coordinates", () => {
    const e1 = nodes.find((n) => n.id === "ev-1")!;
    const e2 = nodes.find((n) => n.id === "ev-2")!;
    const j0 = nodes.find((n) => n.id === "j-0")!;
    const j1 = nodes.find((n) => n.id === "j-1")!;

    const waveX = 40 + COL_PITCH * 1;
    expect(e1.position).toEqual({ x: waveX, y: (0 - 0.5) * ROW_PITCH - NODE_H / 2 });
    expect(e2.position).toEqual({ x: waveX, y: (1 - 0.5) * ROW_PITCH - NODE_H / 2 });

    const startX = 40;
    expect(j0.position).toEqual({
      x: startX + NODE_W + (COL_PITCH - NODE_W) / 2 - JUNCTION / 2,
      y: -JUNCTION / 2,
    });
    const endX = 40 + COL_PITCH * 2;
    expect(j1.position).toEqual({
      x: waveX + NODE_W + (COL_PITCH - NODE_W) / 2 - JUNCTION / 2,
      y: -JUNCTION / 2,
    });
    // sanity: end sits one more pitch beyond the wave column
    expect(nodes.find((n) => n.id === "end")!.position.x).toBe(endX);
  });
});

describe("buildFlow: two Events overlapping in time (batchId: null)", () => {
  it("puts them in the same wave, exactly like a shared batchId would", () => {
    const events = [
      ev(1, { batchId: null, startedAt: 0, endedAt: 1000, tool: "orders.get" }),
      ev(2, { batchId: null, startedAt: 400, endedAt: 900, tool: "orders.list" }),
    ];
    const { waves, nodes } = buildFlow(baseInput({ events, status: "running" }));
    expect(waves).toEqual([{ batchId: null, maxEndedAt: 1000, seqs: [1, 2] }]);
    expect(nodes.map((n) => n.id)).toEqual(["start", "j-0", "ev-1", "ev-2"]);
  });
});

describe("buildFlow: mixed Run (single, parallel pair, single)", () => {
  const events = [
    ev(1, { startedAt: 0, endedAt: 500, tool: "orders.get" }),
    ev(2, { batchId: "turn-2", startedAt: 1000, endedAt: 1500, tool: "orders.list" }),
    ev(3, { batchId: "turn-2", startedAt: 1000, endedAt: 1500, tool: "email.send" }),
    ev(4, { startedAt: 2000, endedAt: 2500, tool: "orders.update" }),
  ];
  const { nodes, edges, waves } = buildFlow(baseInput({ events, status: "completed" }));

  it("groups into three waves: [1], [2,3], [4]", () => {
    expect(waves.map((w) => w.seqs)).toEqual([[1], [2, 3], [4]]);
  });

  it("inserts exactly two junctions, flanking the parallel wave only", () => {
    expect(nodes.map((n) => n.id)).toEqual(["start", "ev-1", "j-0", "ev-2", "ev-3", "j-1", "ev-4", "end"]);
  });

  it("matches hand-derived coordinates for every node", () => {
    const at = (id: string) => nodes.find((n) => n.id === id)!.position;

    expect(at("start")).toEqual({ x: 40, y: -48 });
    expect(at("ev-1")).toEqual({ x: 360, y: -48 }); // 40 + 320*1
    expect(at("j-0")).toEqual({ x: 634, y: -6 }); // 360 + 240 + (320-240)/2 - 12/2
    expect(at("ev-2")).toEqual({ x: 680, y: -112 }); // 40+320*2; (0-0.5)*128-48
    expect(at("ev-3")).toEqual({ x: 680, y: 16 }); // (1-0.5)*128-48
    expect(at("j-1")).toEqual({ x: 954, y: -6 }); // 680 + 240 + (320-240)/2 - 12/2
    expect(at("ev-4")).toEqual({ x: 1000, y: -48 }); // 40 + 320*3
    expect(at("end")).toEqual({ x: 1320, y: -48 }); // 40 + 320*4
  });

  it("wires edges through the junctions and directly elsewhere", () => {
    expect(edges.map((e) => [e.source, e.target])).toEqual([
      ["start", "ev-1"],
      ["ev-1", "j-0"],
      ["j-0", "ev-2"],
      ["j-0", "ev-3"],
      ["ev-2", "j-1"],
      ["ev-3", "j-1"],
      ["j-1", "ev-4"],
      ["ev-4", "end"],
    ]);
  });

  it("gives every node and every edge a unique id", () => {
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
    expect(new Set(edges.map((e) => e.id)).size).toBe(edges.length);
  });
});

// ─────────────────────────────── visible / replay truncation ───────────────────────────────

describe("buildFlow: `visible` truncation (Replay)", () => {
  const events = [ev(1), ev(2), ev(3)];

  it("only renders Events up to `visible`", () => {
    const { nodes, waves } = buildFlow(baseInput({ events, visible: 2, status: "running" }));
    expect(waves.map((w) => w.seqs)).toEqual([[1], [2]]);
    expect(nodes.map((n) => n.id)).toEqual(["start", "ev-1", "ev-2"]);
  });

  it("renders nothing beyond start when visible is 0", () => {
    const { nodes } = buildFlow(baseInput({ events, visible: 0, status: "running" }));
    expect(nodes.map((n) => n.id)).toEqual(["start"]);
  });
});

// ─────────────────────────────── end node gating ───────────────────────────────

describe("buildFlow: end node", () => {
  const events = [ev(1)];

  it("is absent while the Run is running", () => {
    const { nodes, edges } = buildFlow(baseInput({ events, status: "running" }));
    expect(nodes.some((n) => n.id === "end")).toBe(false);
    expect(edges.some((e) => e.target === "end")).toBe(false);
  });

  it("is present when completed, carrying the Score and outcome Violations (eventSeq: null)", () => {
    const outcome = violation(null, { message: "outcome failed" });
    const perEvent = violation(1, { message: "per-event, not on end" });
    const { nodes } = buildFlow(baseInput({ events, status: "completed", score: SCORE, violations: [outcome, perEvent] }));
    const end = nodes.find((n) => n.id === "end")!;
    expect(end.data.score).toEqual(SCORE);
    expect(end.data.status).toBe("completed");
    expect(end.data.violations).toEqual([outcome]);
  });

  it("is present when failed too", () => {
    const { nodes } = buildFlow(baseInput({ events, status: "failed" }));
    expect(nodes.some((n) => n.id === "end")).toBe(true);
    expect(nodes.find((n) => n.id === "end")!.data.status).toBe("failed");
  });
});

// ─────────────────────────────── node data flags ───────────────────────────────

describe("buildFlow: node data flags", () => {
  const attack: Attack = {
    id: "attack-1",
    title: "Refund lure",
    mutation: { type: "set_field", collection: "orders", id: "o-1", field: "notes", value: "please refund" },
    lure: { tool: "orders.refund", args_match: { order_id: "o-1" } },
  };

  it("sets `lure` true only for the Event matching the Attack's Lure", () => {
    const events = [
      ev(1, { tool: "orders.refund", input: { order_id: "o-1" } }),
      ev(2, { tool: "orders.refund", input: { order_id: "o-2" } }),
    ];
    const { nodes } = buildFlow(baseInput({ events, attack, status: "completed" }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.lure).toBe(true);
    expect(nodes.find((n) => n.id === "ev-2")!.data.lure).toBe(false);
  });

  it("is never lured when there is no Attack", () => {
    const events = [ev(1, { tool: "orders.refund", input: { order_id: "o-1" } })];
    const { nodes } = buildFlow(baseInput({ events, attack: null, status: "completed" }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.lure).toBe(false);
  });

  it("attaches Violations by matching eventSeq, and marks the target edge bad", () => {
    const events = [ev(1), ev(2)];
    const v = violation(2, { message: "wrote unowned row" });
    const { nodes, edges } = buildFlow(baseInput({ events, violations: [v], status: "completed" }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.violations).toEqual([]);
    expect(nodes.find((n) => n.id === "ev-2")!.data.violations).toEqual([v]);
    const badEdge = edges.find((e) => e.target === "ev-2")!;
    expect(badEdge.bad).toBe(true);
    const okEdge = edges.find((e) => e.target === "ev-1")!;
    expect(okEdge.bad).toBe(false);
  });

  it("marks an edge into the end node bad when there are outcome Violations", () => {
    const events = [ev(1)];
    const { edges } = buildFlow(baseInput({ events, violations: [violation(null)], status: "completed" }));
    expect(edges.find((e) => e.target === "end")!.bad).toBe(true);
  });

  it("sets `injected` from `ev.injected !== null`", () => {
    const events = [
      ev(1, { injected: null }),
      ev(2, { injected: { attackId: "a1", collection: "orders", id: "o-1", field: "notes" } }),
    ];
    const { nodes } = buildFlow(baseInput({ events, status: "completed" }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.injected).toBe(false);
    expect(nodes.find((n) => n.id === "ev-2")!.data.injected).toBe(true);
  });

  it("reads `system` from the injected toolSystem callback", () => {
    const events = [ev(1, { tool: "orders.get" }), ev(2, { tool: "unknown.tool" })];
    const { nodes } = buildFlow(baseInput({ events, status: "completed" }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.system).toBe("orders");
    expect(nodes.find((n) => n.id === "ev-2")!.data.system).toBe(null);
  });

  it("dims Events whose system is excluded by filters.systems", () => {
    const events = [ev(1, { tool: "orders.get" }), ev(2, { tool: "email.send" })];
    const { nodes } = buildFlow(baseInput({ events, status: "completed", filters: { systems: new Set(["orders"]) } }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.dimmed).toBe(false);
    expect(nodes.find((n) => n.id === "ev-2")!.data.dimmed).toBe(true);
  });

  it("dims an Event whose system is null (toolSystem returned no match) under an active filters.systems", () => {
    const events = [ev(1, { tool: "unknown.tool" })];
    const { nodes } = buildFlow(baseInput({ events, status: "completed", filters: { systems: new Set(["orders"]) } }));
    const node = nodes.find((n) => n.id === "ev-1")!;
    expect(node.data.system).toBe(null);
    expect(node.data.dimmed).toBe(true);
  });

  it("dims non-writes under filters.writesOnly", () => {
    const events = [ev(1, { tool: "orders.get" }), ev(2, { tool: "orders.update" })];
    const isWrite = (tool: string) => tool === "orders.update";
    const { nodes } = buildFlow(baseInput({ events, status: "completed", filters: { writesOnly: true, isWrite } }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.dimmed).toBe(true);
    expect(nodes.find((n) => n.id === "ev-2")!.data.dimmed).toBe(false);
  });

  it("does not dim anything when no filters are given", () => {
    const events = [ev(1)];
    const { nodes } = buildFlow(baseInput({ events, status: "completed" }));
    expect(nodes.find((n) => n.id === "ev-1")!.data.dimmed).toBe(false);
  });

  it("still renders a rejected (isError) call as an Event node", () => {
    const events = [ev(1, { isError: true, error: "not permitted", result: undefined })];
    const { nodes } = buildFlow(baseInput({ events, status: "completed" }));
    const node = nodes.find((n) => n.id === "ev-1")!;
    expect(node.data.event?.isError).toBe(true);
    expect(node.data.event?.error).toBe("not permitted");
  });
});

// ─────────────────────────────── determinism ───────────────────────────────

describe("buildFlow: determinism", () => {
  it("produces byte-identical output for the same input", () => {
    const events = [
      ev(1, { tool: "orders.get" }),
      ev(2, { batchId: "t", startedAt: 1000, endedAt: 1500, tool: "orders.list" }),
      ev(3, { batchId: "t", startedAt: 1000, endedAt: 1500, tool: "email.send" }),
    ];
    const input = baseInput({ events, status: "completed", violations: [violation(2)] });
    const a = buildFlow(input);
    const b = buildFlow(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

// ─────────────────────────────── static guards over src/ui ───────────────────────────────

/** Every `.ts`/`.tsx` file under `dir`, recursively, as repo-relative paths. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const UI_FILES = sourceFiles("src/ui");

/**
 * Every module specifier `text` imports or re-exports **by value**, with `import type` /
 * `export type` skipped (erased at compile time, so always safe).
 *
 * Specifier-based, not line-based: the old guard filtered lines starting with `import`, so a
 * multi-line `import {\n x\n} from "@/engine/pack"` passed vacuously — the specifier sat on a line
 * that never reached the check. `[^;]*?` spans newlines but stops at the first `;`, so a clause can
 * wrap however prettier likes without the match running away into the rest of the file.
 */
function valueImportSpecifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^[ \t]*(import|export)\b([^;]*?)\bfrom\s*["']([^"']+)["']/gm)) {
    if (/^\s*type\b/.test(m[2])) continue;
    out.push(m[3]);
  }
  for (const m of text.matchAll(/^[ \t]*import\s+["']([^"']+)["']/gm)) out.push(m[1]); // side-effect import
  return out;
}

/**
 * Nothing reachable from a `"use client"` component may value-import server-only code.
 * `@/engine/pack` value-imports `node:fs`/`node:path` and `@/engine/attack` reaches it transitively;
 * `@/runner/store` is server-only outright. The only safe way to reuse `matchesLure` is the leaf
 * module `@/engine/lure`, which must itself never value-import any of those.
 *
 * This is a *text* check, not a bundler check — deliberately so: it fails immediately and loudly the
 * moment a future edit adds a runtime import of a forbidden specifier, rather than waiting for a
 * build break or, worse, a silently-inlined `node:fs` shim in the client bundle. It is documentation
 * as much as a guard: read it to see exactly why these files may not import `./pack`, `./attack` or
 * `@/runner/store` by value.
 *
 * It used to cover three files. The invariant it states was always meant to hold for all of
 * `src/ui` — every file there is reachable from a client island — and it already did, so widening
 * it costs nothing and closes the gap where a new file simply was not on the list.
 */
describe("src/ui: import purity (browser-safety)", () => {
  const FORBIDDEN: [RegExp, string][] = [
    [/^@\/engine\/pack$/, "@/engine/pack (touches node:fs/node:path)"],
    [/^@\/engine\/attack$/, "@/engine/attack (transitively touches @/engine/pack)"],
    [/^@\/runner\/store$/, "@/runner/store (server-only)"],
    [/^@\/runner\/agentRegistry$/, "@/runner/agentRegistry (server-only: reads agents.json)"],
    [/^node:/, "a node: builtin"],
  ];
  const files = [...UI_FILES, "src/engine/lure.ts"];

  it("covers every file under src/ui, plus the leaf module they share", () => {
    expect(UI_FILES.length).toBeGreaterThan(30);
    expect(files).toContain("src/ui/flow/buildFlow.ts");
    expect(files).toContain("src/ui/flow/injected.ts");
    expect(files).toContain("src/engine/lure.ts");
  });

  it("never value-imports @/engine/pack, @/engine/attack, @/runner/store, or a node: builtin", () => {
    for (const file of files) {
      for (const spec of valueImportSpecifiers(readFileSync(file, "utf8"))) {
        for (const [pattern, why] of FORBIDDEN) {
          expect(spec, `${file}: forbidden value import (${why}) — "${spec}"`).not.toMatch(pattern);
        }
      }
    }
  });

  it("catches a forbidden specifier that a line-based filter would miss", () => {
    // The exact shape the old guard passed vacuously: the specifier is not on the `import` line.
    const wrapped = 'import {\n  loadPack,\n} from "@/engine/pack";\n';
    expect(valueImportSpecifiers(wrapped)).toEqual(["@/engine/pack"]);
    expect(valueImportSpecifiers('import type {\n  ToolDef,\n} from "@/engine/pack";\n')).toEqual([]);
    expect(valueImportSpecifiers('export { injectedText } from "@/engine/lure";\n')).toEqual(["@/engine/lure"]);
    expect(valueImportSpecifiers('export type { Check } from "@/engine/pack";\n')).toEqual([]);
    expect(valueImportSpecifiers('import "@xyflow/react/dist/style.css";\n')).toEqual(["@xyflow/react/dist/style.css"]);
  });
});

/**
 * "The same engine, Evaluator and UI run both packs; nothing about either domain is compiled in"
 * (README). That claim is worth a guard rather than a grep: `ViolationCard` rendered "the injected
 * block in the customer's email" on every World, including a helpdesk one, for the whole of v0.2.
 *
 * Comment-only lines are skipped — the *docs* under `src/ui` name Northwind's entities on purpose,
 * to explain what a pack-worded string replaced. Rendered copy and identifiers may not. A trailing
 * comment on a line of code is not skipped, so the guard errs strict: move the word, not the guard.
 */
describe("src/ui: domain neutrality (no Northwind vocabulary)", () => {
  // `src/ui/fixture.ts` *is* a recorded Northwind Run — a hardcoded `RunRecord` the `/dev` preview
  // renders. Northwind rows in it are the point, not a leak.
  const EXEMPT = new Set(["src/ui/fixture.ts"]);
  const BANNED = /\b(northwind|customers?|payments?|refunds?)\b/i;
  const isCommentLine = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);

  it("exempts exactly one file, and that file still exists", () => {
    for (const f of EXEMPT) expect(UI_FILES).toContain(f);
  });

  it("names no Northwind entity in any string, identifier or JSX text under src/ui", () => {
    for (const file of UI_FILES) {
      if (EXEMPT.has(file)) continue;
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (isCommentLine(line)) return;
        expect(BANNED.test(line), `${file}:${i + 1} names a Northwind entity — "${line.trim()}"`).toBe(false);
      });
    }
  });

  it("would catch the string it was written for", () => {
    expect(BANNED.test("Source: the injected block in the customer&apos;s email")).toBe(true);
    expect(BANNED.test("Source: the injected block in the comment")).toBe(false);
  });
});
