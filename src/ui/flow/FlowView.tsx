"use client";
import { useCallback, useMemo } from "react";
import { Background, Controls, MiniMap, ReactFlow, ReactFlowProvider, type NodeChange } from "@xyflow/react";
import type { AppNode } from "./EventNode";
import { EventNode } from "./EventNode";
import { EndNode, JunctionNode, StartNode } from "./MetaNodes";
import { EventDrawer } from "./EventDrawer";
import { FIT, useFlowCamera } from "./useFlowCamera";
import { nodeIdOf, runGraph, toSelection, toXyflow } from "./toXyflow";
import { systemsOf, type FlowFilters, type FlowSelection } from "./useFlowState";
import type { RunRecord, ToolDef } from "../types";
import { RED } from "../styles";

const nodeTypes = { event: EventNode, start: StartNode, junction: JunctionNode, end: EndNode };

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
  /** The Run's pack's label for the collection its Attack injected into — see `ViolationCard`. */
  injectedLabel: string;
};

function FlowCanvas({ run, visible, selectedSeq, onSelect, filters, follow, fitSignal, tools, injectedLabel }: FlowViewProps) {
  const systems = useMemo(() => systemsOf(tools), [tools]);
  const shown = useMemo(() => run.events.slice(0, visible), [run.events, visible]);
  const scoreReady = visible >= run.events.length;

  // The graph does not depend on the selection, so selecting a node must not rebuild it.
  const graph = useMemo(() => runGraph(run, visible, filters, tools), [run, visible, filters, tools]);

  const newestId = shown.length > 0 ? `ev-${shown[shown.length - 1].seq}` : "start";
  const { nodes, edges } = useMemo(
    () => toXyflow(graph, { selected: selectedSeq, systems, tools, brief: run.taskBrief, newestId, running: run.status === "running", scoreReady }),
    [graph, selectedSeq, systems, tools, run.taskBrief, run.status, newestId, scoreReady],
  );

  const chasing = follow && (run.status === "running" || visible < run.events.length);
  const camera = useFlowCamera({
    chasing,
    newest: graph.nodes.find((n) => n.id === newestId) ?? null,
    drawerOpen: selectedSeq !== null,
    fitSignal,
  });

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

  // Selecting a node from outside the graph (the drawer's "jump to #N", `←`/`→`) also brings it into
  // view — unless the camera is already chasing the newest node, which would undo it at once.
  const jump = useCallback(
    (seq: number) => {
      onSelect(seq);
      const node = graph.nodes.find((n) => n.id === nodeIdOf(seq));
      if (!chasing && node) camera.centreOn(node);
    },
    [onSelect, graph, chasing, camera],
  );

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onPaneClick={() => onSelect(null)}
        onDoubleClick={(e) => { if ((e.target as HTMLElement).classList.contains("react-flow__pane")) camera.fit(); }}
        zoomOnDoubleClick={false}
        fitView={camera.fitOnMount}
        fitViewOptions={{ ...FIT, maxZoom: 1 }}
        panOnScroll
        nodesDraggable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        minZoom={0.1}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E3E0D5" gap={24} />
        <MiniMap<AppNode> pannable zoomable nodeColor={(n) => (n.data.violations.length > 0 || n.data.lure ? RED : "#E3E0D5")} maskColor="rgba(244,244,242,.7)" className="!bg-white !border !border-[#E3E0D5]" />
        <Controls showInteractive={false} fitViewOptions={FIT} />
      </ReactFlow>
      <EventDrawer run={run} events={shown} selected={selectedSeq} onSelect={onSelect} onJump={jump} tools={tools} systems={systems} scoreReady={scoreReady} injectedLabel={injectedLabel} />
    </>
  );
}

/** A Run as a pan/zoom flow diagram: waves of concurrent tool calls become parallel branches. */
export function FlowView(props: FlowViewProps) {
  return (
    <div className="relative min-h-0 flex-1">
      {/* The drawer lives inside the provider: its "jump to #N" moves the camera, not just the selection. */}
      <ReactFlowProvider>
        <FlowCanvas {...props} />
      </ReactFlowProvider>
    </div>
  );
}
