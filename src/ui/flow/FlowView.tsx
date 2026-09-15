"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useNodesInitialized,
  useReactFlow,
  type Edge,
  type NodeChange,
} from "@xyflow/react";
import { buildFlow, NODE_H, NODE_W, type FlowNode } from "./buildFlow";
import { EventNode, type AppNode } from "./EventNode";
import { EndNode, JunctionNode, StartNode } from "./MetaNodes";
import { systemsOf, type FlowFilters, type FlowSelection } from "./useFlowState";
import type { RunRecord, ToolDef } from "../types";
import { RED } from "../styles";

const nodeTypes = { event: EventNode, start: StartNode, junction: JunctionNode, end: EndNode };
const RULE = "#cfcfcb";

export type FlowViewProps = {
  run: RunRecord;
  visible: number;
  selectedSeq: FlowSelection;
  onSelect: (selection: FlowSelection) => void;
  filters: FlowFilters;
  follow: boolean;
  /** Incremented by the toolbar's *fit* action. */
  fitSignal: number;
  tools: Record<string, ToolDef>;
};

const reducedMotion = (): boolean => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
const duration = (): number => (reducedMotion() ? 0 : 300);

/** `ev-9` → 9, `start`/`end` → themselves, junctions → nothing selectable. */
function toSelection(id: string): FlowSelection {
  if (id === "start" || id === "end") return id;
  return id.startsWith("ev-") ? Number(id.slice(3)) : null;
}

function ariaLabel(node: FlowNode): string {
  if (node.data.kind === "start") return "Run started";
  if (node.data.kind === "end") return `End of Run, Trust Score ${node.data.score?.headline ?? "pending"}`;
  const ev = node.data.event;
  if (!ev) return "";
  const flags = [node.data.violations.length > 0 ? "Violation" : "", node.data.lure ? "Lure taken" : "", node.data.injected ? "reads injected content" : ""].filter(Boolean);
  return `Event ${ev.seq}, ${ev.tool}${flags.length ? `, ${flags.join(", ")}` : ""}`;
}

function FlowCanvas({ run, visible, selectedSeq, onSelect, filters, follow, fitSignal, tools }: FlowViewProps) {
  const { setCenter, fitView } = useReactFlow();
  // `setCenter` is a no-op until xyflow has adopted the nodes, so a follow issued on the very first
  // render would be silently dropped — wait for this instead (true from the first commit, because
  // every node carries its own `measured` size below).
  const ready = useNodesInitialized();
  const systems = useMemo(() => systemsOf(tools), [tools]);

  const { nodes, edges, newest } = useMemo(() => {
    const flow = buildFlow({
      events: run.events,
      visible,
      violations: run.violations,
      attack: run.attack,
      status: run.status,
      score: run.score,
      toolSystem: (tool) => tools[tool]?.system ?? null,
      filters: {
        systems: filters.systems.size > 0 ? filters.systems : undefined,
        writesOnly: filters.writesOnly,
        isWrite: (tool) => tools[tool]?.kind === "write",
      },
    });
    const shown = run.events.slice(0, visible);
    const newestId = shown.length > 0 ? `ev-${shown[shown.length - 1].seq}` : "start";
    const running = run.status === "running";
    return {
      newest: flow.nodes.find((n) => n.id === newestId) ?? null,
      nodes: flow.nodes.map<AppNode>((n) => ({
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
        selected: n.id === (typeof selectedSeq === "number" ? `ev-${selectedSeq}` : selectedSeq),
        selectable: n.type !== "junction",
        focusable: n.type !== "junction",
        draggable: false,
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ariaLabel: ariaLabel(n),
        data: {
          ...n.data,
          systems,
          toolDef: n.data.event ? tools[n.data.event.tool] : undefined,
          brief: run.taskBrief,
          newest: n.id === newestId,
          running,
        },
      })),
      edges: flow.edges.map<Edge>((e) => ({
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
  }, [run, visible, filters, tools, selectedSeq, systems]);

  // The flow is read-only, so the only change we care about is selection — which xyflow reports
  // here for both a click and a keyboard Enter/Space (Escape arrives as a deselect).
  const onNodesChange = useCallback(
    (changes: NodeChange<AppNode>[]) => {
      let next: FlowSelection | undefined;
      for (const c of changes) {
        if (c.type !== "select") continue;
        if (c.selected) next = toSelection(c.id);
        else if (next === undefined) next = null;
      }
      if (next !== undefined) onSelect(next);
    },
    [onSelect],
  );

  // Spec §6.1: the camera follows the newest node while the Run is running, and the newest *visible*
  // node while replaying. A finished Run shown in full is left where `fitView` put it — the whole Run.
  const chasing = follow && (run.status === "running" || visible < run.events.length);
  const newestId = newest?.id ?? null;
  const newestX = newest?.position.x ?? 0;
  const newestY = newest?.position.y ?? 0;
  // A queued `fitView` runs after our first `setCenter` and would undo it, so a Run that opens
  // chasing (live, or mid-Replay) never asks for one; a finished Run opens fitted to the whole Run.
  const [fitOnMount] = useState(() => !chasing);

  useEffect(() => {
    if (!chasing || newestId === null || !ready) return;
    void setCenter(newestX + NODE_W / 2, newestY + NODE_H / 2, { zoom: 1, duration: duration() });
  }, [chasing, newestId, newestX, newestY, setCenter, ready]);

  const fit = useCallback(() => void fitView({ padding: 0.2, duration: duration() }), [fitView]);

  useEffect(() => {
    if (fitSignal === 0) return;
    fit();
  }, [fitSignal, fit]);

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onPaneClick={() => onSelect(null)}
      onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains("react-flow__pane")) fit(); }}
      zoomOnDoubleClick={false}
      fitView={fitOnMount}
      fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
      panOnScroll
      nodesDraggable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      minZoom={0.1}
      maxZoom={1.6}
      proOptions={{ hideAttribution: true }}
    >
      <Background color="#e6e6e2" gap={24} />
      <MiniMap<AppNode> pannable zoomable nodeColor={(n) => (n.data.violations.length > 0 || n.data.lure ? RED : "#cfcfcb")} maskColor="rgba(244,244,242,.7)" className="!bg-white !border !border-[#cfcfcb]" />
      <Controls showInteractive={false} fitViewOptions={{ padding: 0.2 }} />
    </ReactFlow>
  );
}

/** A Run as a pan/zoom flow diagram: waves of concurrent tool calls become parallel branches. */
export function FlowView(props: FlowViewProps) {
  return (
    <div className="min-h-0 flex-1">
      <ReactFlowProvider>
        <FlowCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
