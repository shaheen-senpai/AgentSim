"use client";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import type { FlowNodeData, FlowNodeKind } from "./buildFlow";
import type { ToolDef } from "../types";
import { fmtArgs, summarizeResult } from "../format";
import { systemColor } from "../systemColor";
import { mono, RED } from "../styles";

/** Everything `buildFlow` does not know about, added when the graph is mapped onto xyflow nodes. */
export type NodeExtras = {
  /** The pack's Systems, for a stable `systemColor` index. */
  systems: string[];
  /** The Event's own tool definition, for generic arg/result formatting. */
  toolDef?: ToolDef;
  /** The Task Brief, shown on the `start` node. */
  brief?: string;
  /** Newest visible node — pulses while the Run is running. */
  newest: boolean;
  running: boolean;
};

export type AppNodeData = FlowNodeData & NodeExtras;
export type AppNode = Node<AppNodeData, FlowNodeKind>;

/** Handles are invisible: the flow is read-only, they only anchor the edges left and right. */
export function Ports({ source = true, target = true }: { source?: boolean; target?: boolean }) {
  return (
    <>
      {target && <Handle type="target" position={Position.Left} isConnectable={false} className="!h-1 !w-1 !min-w-0 !min-h-0 !border-0 !bg-transparent" />}
      {source && <Handle type="source" position={Position.Right} isConnectable={false} className="!h-1 !w-1 !min-w-0 !min-h-0 !border-0 !bg-transparent" />}
    </>
  );
}

const BADGE = "shrink-0 rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-[.04em] leading-3";

/** The three flow badges of spec §6.1 — text, never colour alone. */
export function Badge({ kind, children }: { kind: "violation" | "lure" | "injected"; children: React.ReactNode }) {
  const style =
    kind === "lure" ? "bg-[#c8321e] text-white"
    : kind === "violation" ? "bg-[#fbeeea] text-[#c8321e]"
    : "border border-[#c8321e] text-[#c8321e] bg-white";
  return <span className={`${BADGE} ${style}`}>{children}</span>;
}

/** The shell every node draws inside: fixed 240×96, clipped, ringed when selected, dimmed when filtered out. */
export function NodeShell({ selected, dimmed, bad, children }: { selected: boolean; dimmed: boolean; bad?: boolean; children: React.ReactNode }) {
  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded border px-2 py-1.5 text-left transition-opacity ${
        bad ? "border-[#c8321e] bg-[#fbeeea]" : "border-[#cfcfcb] bg-white"
      } ${selected ? "ring-2 ring-[#1d1d1b]" : ""} ${dimmed ? "opacity-30" : ""}`}
    >
      {children}
    </div>
  );
}

/** One Event: System stripe and badge, `#seq`, duration, tool, args, result, badges. */
export function EventNode({ data, selected }: NodeProps<AppNode>) {
  const ev = data.event;
  if (!ev) return null;
  const bad = data.violations.length > 0 || data.lure;
  const color = data.system ? systemColor(data.systems, data.system) : null;
  const args = fmtArgs(ev.input, data.toolDef);
  const result = summarizeResult(data.toolDef, ev);
  const pulse = data.newest && data.running;

  return (
    <>
      <Ports />
      <div className="h-full w-full" style={color ? { borderLeft: `4px solid ${color.stripe}`, borderRadius: 4 } : undefined}>
        <NodeShell selected={selected} dimmed={data.dimmed} bad={bad}>
          <div className="flex items-center gap-1.5 text-[10px] leading-none">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${pulse ? "animate-pulse motion-reduce:animate-none" : ""}`}
              style={{ background: ev.isError || bad ? RED : "#2f7d4f" }}
            />
            <span className={`${mono} shrink-0 text-[#6b6b66]`}>#{ev.seq}</span>
            {data.system && color && (
              <span className="truncate rounded-sm px-1 py-px text-[9px] font-semibold uppercase tracking-[.04em]" style={{ background: color.bg, color: color.fg }}>
                {data.system}
              </span>
            )}
            <span className={`${mono} ml-auto shrink-0 text-[#6b6b66]`}>{ev.endedAt - ev.startedAt} ms</span>
          </div>
          <div className={`${mono} mt-1 truncate text-[12px] font-semibold leading-4`}>{ev.tool}</div>
          {args && <div className={`${mono} truncate text-[10px] leading-3 text-[#6b6b66]`}>{args}</div>}
          {result && <div className="truncate text-[10px] leading-3 text-[#6b6b66]">{result}</div>}
          <div className="mt-auto flex items-center gap-1 overflow-hidden pt-1">
            {data.violations.length > 0 && (
              <Badge kind="violation">{data.violations.length > 1 ? `${data.violations.length} Violations` : "Violation"}</Badge>
            )}
            {data.lure && <Badge kind="lure">Lure taken</Badge>}
            {data.injected && <span className={`${BADGE} min-w-0 truncate border border-[#c8321e] bg-white text-[#c8321e]`}>reads injected content</span>}
          </div>
        </NodeShell>
      </div>
    </>
  );
}
