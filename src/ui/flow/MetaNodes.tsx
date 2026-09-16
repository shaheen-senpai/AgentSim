"use client";
import type { NodeProps } from "@xyflow/react";
import { Badge, NodeShell, Ports, type AppNode } from "./EventNode";
import { dangerPill, heading, mono } from "../styles";

/** Where the Run begins: the Task Brief the agent was given. */
export function StartNode({ data, selected }: NodeProps<AppNode>) {
  return (
    <>
      <Ports target={false} />
      <NodeShell selected={selected} dimmed={false}>
        <div className={heading}>Task Brief</div>
        <div className="mt-1 text-[10px] leading-3 text-[#6E6B60]" style={{ display: "-webkit-box", WebkitLineClamp: 4, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
          {data.brief ?? "Run started"}
        </div>
        <div className="mt-auto pt-1 text-[10px] uppercase tracking-[.06em] text-[#6E6B60]">Run started</div>
      </NodeShell>
    </>
  );
}

/** A 12 px dot that fans a wave's parallel branches in and out. Not selectable, not focusable. */
export function JunctionNode() {
  return (
    <>
      <Ports />
      <div className="h-3 w-3 rounded-full bg-[#E3E0D5]" aria-hidden />
    </>
  );
}

/**
 * Where the Run ends: the Trust Score, its cap, and the Violations that belong to the outcome.
 * Mid-Replay the score is withheld (`scoreReady`) just as `ScorePanel` withholds it — showing the
 * final number while the Run is still playing back gives the ending away.
 */
export function EndNode({ data, selected }: NodeProps<AppNode>) {
  const score = data.scoreReady ? data.score ?? null : null;
  const outcome = data.violations.length;
  return (
    <>
      <Ports source={false} />
      <NodeShell selected={selected} dimmed={false} bad={score?.capped === true}>
        <div className={heading}>Trust Score</div>
        {score ? (
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className={`${mono} text-[32px] font-bold leading-none tracking-tight ${score.capped ? "text-[#B23A22]" : ""}`}>{score.headline}</span>
            {score.capped && <span className={`${dangerPill} px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[.08em]`}>Capped</span>}
          </div>
        ) : (
          <div className="mt-1 text-[11px] text-[#6E6B60]">{data.status === "failed" ? "Run failed" : "evaluating…"}</div>
        )}
        {score?.capReason && <div className="mt-1 truncate text-[10px] leading-3 text-[#6E6B60]">{score.capReason}</div>}
        <div className="mt-auto flex items-center gap-1 overflow-hidden pt-1">
          {outcome > 0 && <Badge kind="violation">{outcome > 1 ? `${outcome} outcome Violations` : "1 outcome Violation"}</Badge>}
        </div>
      </NodeShell>
    </>
  );
}
