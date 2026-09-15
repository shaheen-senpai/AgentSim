// The bridge between `buildFlow`'s framework-free graph and the shapes `@xyflow/react` wants.
// Kept out of `FlowView.tsx` so that file is only camera, keyboard and composition; kept out of
// `buildFlow.ts` so the graph model itself stays free of any xyflow import (spec §6.1).
import { MarkerType, Position, type Edge } from "@xyflow/react";
import { buildFlow, type FlowEdge, type FlowNode } from "./buildFlow";
import type { AppNode } from "./EventNode";
import type { FlowFilters, FlowSelection } from "./useFlowState";
import type { RunRecord, ToolDef } from "../types";
import { RED } from "../styles";

const RULE = "#cfcfcb";

/** `buildFlow` for a `RunRecord`: the toolbar's filters and the pack's tools, in its own vocabulary. */
export function runGraph(run: RunRecord, visible: number, filters: FlowFilters, tools: Record<string, ToolDef>): { nodes: FlowNode[]; edges: FlowEdge[] } {
  return buildFlow({
    events: run.events,
    visible,
    violations: run.violations,
    attack: run.attack,
    status: run.status,
    score: run.score,
    toolSystem: (tool) => tools[tool]?.system ?? null,
    filters: {
      // An empty chip set means "no System filter", not "match nothing".
      systems: filters.systems.size > 0 ? filters.systems : undefined,
      writesOnly: filters.writesOnly,
      isWrite: (tool) => tools[tool]?.kind === "write",
    },
  });
}

/** A `FlowSelection` as the node id that carries it — `9` → `ev-9`, `start`/`end` → themselves. */
export function nodeIdOf(selection: FlowSelection): string | null {
  return typeof selection === "number" ? `ev-${selection}` : selection;
}

/** The inverse: `ev-9` → 9, `start`/`end` → themselves, a junction → nothing selectable. */
export function toSelection(id: string): FlowSelection {
  if (id === "start" || id === "end") return id;
  return id.startsWith("ev-") ? Number(id.slice(3)) : null;
}

/** Everything the xyflow nodes need that the pure graph does not know about. */
export type XyflowContext = {
  selected: FlowSelection;
  /** The pack's Systems, for a stable `systemColor` index. */
  systems: string[];
  tools: Record<string, ToolDef>;
  /** The Task Brief, shown on the `start` node. */
  brief?: string;
  /** Id of the newest visible node — it pulses while the Run is running. */
  newestId: string | null;
  running: boolean;
  /** False while replaying: the `end` node then withholds the Trust Score, as `ScorePanel` does. */
  scoreReady: boolean;
};

/** The node's screen-reader name: what it is, and any of the three flow badges it carries. */
export function ariaLabel(node: FlowNode, scoreReady: boolean): string {
  if (node.data.kind === "start") return "Run started";
  if (node.data.kind === "end") return `End of Run, Trust Score ${(scoreReady && node.data.score?.headline) || "pending"}`;
  const ev = node.data.event;
  if (!ev) return "";
  const flags = [node.data.violations.length > 0 ? "Violation" : "", node.data.lure ? "Lure taken" : "", node.data.injected ? "reads injected content" : ""].filter(Boolean);
  return `Event ${ev.seq}, ${ev.tool}${flags.length ? `, ${flags.join(", ")}` : ""}`;
}

/** `buildFlow`'s nodes and edges as the controlled, read-only `<ReactFlow>` elements we render. */
export function toXyflow(graph: { nodes: FlowNode[]; edges: FlowEdge[] }, ctx: XyflowContext): { nodes: AppNode[]; edges: Edge[] } {
  const selectedId = nodeIdOf(ctx.selected);
  return {
    nodes: graph.nodes.map<AppNode>((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      width: n.width,
      height: n.height,
      // The layout is fixed-size, so hand xyflow the dimensions rather than waiting for it to
      // measure the DOM: this flow is controlled and never applies the dimension changes it would
      // emit, so without this `useNodesInitialized` would stay false forever and the camera would
      // never know when it is safe to move.
      measured: { width: n.width, height: n.height },
      selected: n.id === selectedId,
      selectable: n.type !== "junction",
      focusable: n.type !== "junction",
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
      ariaLabel: ariaLabel(n, ctx.scoreReady),
      data: {
        ...n.data,
        systems: ctx.systems,
        toolDef: n.data.event ? ctx.tools[n.data.event.tool] : undefined,
        brief: ctx.brief,
        newest: n.id === ctx.newestId,
        running: ctx.running,
        scoreReady: ctx.scoreReady,
      },
    })),
    edges: graph.edges.map<Edge>((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: "smoothstep",
      selectable: false,
      focusable: false,
      style: { stroke: e.bad ? RED : RULE, strokeWidth: e.bad ? 2 : 1.5 },
      markerEnd: { type: MarkerType.ArrowClosed, color: e.bad ? RED : RULE, width: 16, height: 16 },
    })),
  };
}
