"use client";
import { agentLabel } from "@/runner/agentRef";
import { CompareColumn } from "./CompareColumn";
import { FlowView } from "./flow/FlowView";
import { useFlowState } from "./flow/useFlowState";
import type { RunRecord, ToolDef } from "./types";
import { panel } from "./styles";

export type CompareRunColumnProps = {
  run: RunRecord;
  /** This Run's pack's tools, for the flow's badges and System colours — `{}` when `packError` is set. */
  tools: Record<string, ToolDef>;
  /** Set when the Run's World pack could no longer be loaded server-side; the column then shows this instead of a flow. */
  packError: string | null;
  /** This Run's pack's label for the collection its Attack injected into — `""` when `packError` is set. */
  injectedLabel: string;
};

/**
 * One side of `/compare`: the score header (`CompareColumn`) plus that Run's flow, each with its
 * own `useFlowState` — so the two columns select, drawer and filter independently. Compare is a
 * static side-by-side comparison, not a replay, so `visible` is always the whole Run (no scrubber)
 * and `follow` is always off — the camera settles once, fitted to the whole Run, on mount.
 */
export function CompareRunColumn({ run, tools, packError, injectedLabel }: CompareRunColumnProps) {
  const flow = useFlowState();
  return (
    <section aria-label={`${agentLabel(run.agent)} agent, Run ${run.id}`} className="flex flex-col gap-3 overflow-hidden">
      <CompareColumn run={run} />
      {/* A fixed height of its own, not `flex-1` on a `flex-col` ancestor that just stretches to fit
          `CompareColumn`'s content: `CompareColumn`'s own height varies a lot (0-5 wrapped Dimension
          chips, a longer or shorter Violation message), so tying the flow's height to "whatever's
          left in the row" made it collapse back to ~0 whenever the header wrapped onto many lines —
          on a narrow column, or a Run with several failing Dimensions. A flow view is a bounded
          visualization, not something that should shrink to nothing depending on unrelated text
          length; `flex-1 min-h-0` still does its job inside this div (matching `RunView.tsx`'s own
          `FlowView` usage) — it just distributes space inside THIS fixed 400px, not the outer row. */}
      <div className="h-[400px] flex flex-col">
        {packError ? (
          <div className={`${panel} flex-1 min-h-0 flex items-center justify-center p-6 text-center text-[#6b6b66]`}>{packError}</div>
        ) : (
          <FlowView
            run={run}
            // Compare is a static comparison, not a replay: always show the whole Run, no scrubber.
            visible={run.events.length}
            selectedSeq={flow.selected}
            onSelect={flow.select}
            filters={flow.filters}
            follow={false}
            fitSignal={flow.fitSignal}
            tools={tools}
            injectedLabel={injectedLabel}
          />
        )}
      </div>
    </section>
  );
}
