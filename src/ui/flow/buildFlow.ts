// Flow graph model for a Run (spec §6.1). Pure, framework-free: Task 13 renders this data with
// `@xyflow/react`, Task 15 reuses it for the Compare page, but this module knows nothing of either
// — no React, no DOM, no `@xyflow/react` import. The only value import is `matchesLure` from the
// leaf module `@/engine/lure` (types only otherwise) — never `@/engine/attack` or `@/engine/pack`
// directly, both of which pull in `node:fs`/`node:path` transitively via `pack.ts`. This keeps the
// module safe to import from a `"use client"` component (Task 13's `FlowView.tsx`) without dragging
// server-only code into the browser bundle; see the import-purity test in
// `tests/ui/buildFlow.test.ts`.
//
// Concurrent tool calls ("waves") lay out as columns, left to right: `start`, one column per wave,
// then `end` when the Run is no longer running. A wave of more than one node gets a small junction
// dot fanning its edges in and out, on whichever side(s) border it — including against `start` or
// `end`, which behave as ordinary single-node columns for this purpose.
import { matchesLure } from "@/engine/lure";
import type { Score, Violation } from "@/engine/evaluator";
import type { Attack } from "@/engine/pack";
import type { Event } from "@/engine/types";

// `src/runner/store.ts` is server-only and must not be imported from this pure module; the type is
// small and stable enough to restate here.
type RunStatus = "running" | "completed" | "failed";

export type FlowNodeKind = "start" | "event" | "junction" | "end";

export type FlowNodeData = {
  kind: FlowNodeKind;
  event?: Event;
  violations: Violation[];
  injected: boolean;
  lure: boolean;
  system: string | null;
  dimmed: boolean;
  label?: string;
  score?: Score | null;
  status?: RunStatus;
};

export type FlowNode = {
  id: string;
  type: FlowNodeKind;
  position: { x: number; y: number };
  data: FlowNodeData;
  width: number;
  height: number;
};

export type FlowEdge = { id: string; source: string; target: string; bad: boolean };

import { groupWaves, type Wave } from "../waves";
export { groupWaves };
export type { Wave };

export type BuildFlowInput = {
  events: Event[];
  visible: number;
  violations: Violation[];
  attack: Attack | null;
  status: RunStatus;
  score: Score | null;
  toolSystem: (tool: string) => string | null;
  filters?: { systems?: Set<string>; writesOnly?: boolean; isWrite?: (tool: string) => boolean };
};

export const NODE_W = 240;
export const NODE_H = 96;
export const COL_PITCH = 320;
export const ROW_PITCH = 128;
export const JUNCTION = 12;
const START_X = 40;

/** Position of the i-th (0-based) of `n` nodes sharing a column, given that node's own height. */
function rowY(i: number, n: number, height: number): number {
  return (i - (n - 1) / 2) * ROW_PITCH - height / 2;
}

/** `filters.systems` excludes the Event's system, or `filters.writesOnly` excludes a non-write tool. */
function isDimmed(tool: string, system: string | null, filters: BuildFlowInput["filters"]): boolean {
  if (!filters) return false;
  if (filters.systems && (system === null || !filters.systems.has(system))) return true;
  if (filters.writesOnly && filters.isWrite && !filters.isWrite(tool)) return true;
  return false;
}

function emptyData(kind: FlowNodeKind, extra: Partial<FlowNodeData> = {}): FlowNodeData {
  return { kind, violations: [], injected: false, lure: false, system: null, dimmed: false, ...extra };
}

/**
 * Builds the Flow graph (nodes, edges, waves) for a Run, or a prefix of one under Replay
 * (`visible`). Deterministic: the same input always produces the same output — stable ordering,
 * no clock or randomness.
 */
export function buildFlow(input: BuildFlowInput): { nodes: FlowNode[]; edges: FlowEdge[]; waves: Wave[] } {
  const events = input.events.slice(0, input.visible);
  const waves = groupWaves(events);
  const eventsBySeq = new Map(events.map((e) => [e.seq, e]));

  const violationsBySeq = new Map<number, Violation[]>();
  const outcomeViolations: Violation[] = [];
  for (const v of input.violations) {
    if (v.eventSeq === null) {
      outcomeViolations.push(v);
      continue;
    }
    const list = violationsBySeq.get(v.eventSeq);
    if (list) list.push(v);
    else violationsBySeq.set(v.eventSeq, [v]);
  }

  const hasEnd = input.status !== "running";

  // Columns, left to right: start, one per wave, end (if the Run isn't still running).
  const columns: string[][] = [
    ["start"],
    ...waves.map((w) => w.seqs.map((seq) => `ev-${seq}`)),
    ...(hasEnd ? [["end"]] : []),
  ];

  // A junction fills the gap between column i and i+1 whenever either side has more than one node
  // — including against the single-node `start`/`end` columns. Ids are assigned in left-to-right
  // creation order, independent of which columns they sit between.
  const junctionAt = new Map<number, string>();
  let junctionCount = 0;
  for (let i = 0; i < columns.length - 1; i++) {
    if (columns[i].length > 1 || columns[i + 1].length > 1) junctionAt.set(i, `j-${junctionCount++}`);
  }

  const nodes: FlowNode[] = [];
  const nodeById = new Map<string, FlowNode>();
  const place = (node: FlowNode): void => {
    nodes.push(node);
    nodeById.set(node.id, node);
  };
  const colX = (i: number): number => START_X + COL_PITCH * i;

  columns.forEach((col, i) => {
    const x = colX(i);
    const n = col.length;
    col.forEach((id, j) => {
      if (id === "start") {
        place({ id, type: "start", width: NODE_W, height: NODE_H, position: { x, y: rowY(j, n, NODE_H) }, data: emptyData("start", { label: "Start" }) });
      } else if (id === "end") {
        place({
          id,
          type: "end",
          width: NODE_W,
          height: NODE_H,
          position: { x, y: rowY(j, n, NODE_H) },
          data: emptyData("end", { label: "End", violations: outcomeViolations, score: input.score, status: input.status }),
        });
      } else {
        const seq = Number(id.slice("ev-".length));
        const e = eventsBySeq.get(seq)!;
        const system = input.toolSystem(e.tool);
        place({
          id,
          type: "event",
          width: NODE_W,
          height: NODE_H,
          position: { x, y: rowY(j, n, NODE_H) },
          data: {
            kind: "event",
            event: e,
            violations: violationsBySeq.get(seq) ?? [],
            injected: e.injected !== null,
            lure: input.attack ? matchesLure(input.attack.lure, e) : false,
            system,
            dimmed: isDimmed(e.tool, system, input.filters),
          },
        });
      }
    });

    const jid = junctionAt.get(i);
    if (jid !== undefined) {
      const jx = colX(i) + NODE_W + (COL_PITCH - NODE_W) / 2 - JUNCTION / 2;
      place({ id: jid, type: "junction", width: JUNCTION, height: JUNCTION, position: { x: jx, y: rowY(0, 1, JUNCTION) }, data: emptyData("junction") });
    }
  });

  // Edges walk the same gaps: straight through when neither side needs a junction, else fanned via
  // it. `bad` follows the *target* node's own violations/lure — a junction never carries either, so
  // only the specific edge leading into the offending node (or into `end`, for outcome Violations)
  // is marked bad.
  const isBad = (id: string): boolean => {
    const data = nodeById.get(id)?.data;
    return data !== undefined && (data.violations.length > 0 || data.lure);
  };
  const edges: FlowEdge[] = [];
  const link = (source: string, target: string): void => {
    edges.push({ id: `e-${source}-${target}`, source, target, bad: isBad(target) });
  };

  for (let i = 0; i < columns.length - 1; i++) {
    const left = columns[i];
    const right = columns[i + 1];
    const jid = junctionAt.get(i);
    if (jid === undefined) {
      link(left[0], right[0]);
    } else {
      for (const src of left) link(src, jid);
      for (const tgt of right) link(jid, tgt);
    }
  }

  return { nodes, edges, waves };
}
