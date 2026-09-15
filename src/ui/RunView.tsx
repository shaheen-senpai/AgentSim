"use client";
import { useEffect, useRef, useState } from "react";
import type { PackOption, RunRecord, RunSummary, ToolDef } from "./types";
import { Header } from "./Header";
import { Launcher } from "./Launcher";
import { ConnectAgent } from "./ConnectAgent";
import { RecentRuns } from "./RecentRuns";
import { Timeline } from "./Timeline";
import { FlowView } from "./flow/FlowView";
import { FlowToolbar } from "./flow/FlowToolbar";
import { useFlowState } from "./flow/useFlowState";
import { ScorePanel } from "./ScorePanel";
import { DiffPanel } from "./DiffPanel";
import { useReplay } from "./useReplay";
import { ReplayScrubber } from "./ReplayScrubber";
import { PromptDiffSheet } from "./PromptDiffSheet";
import { panel } from "./styles";

/**
 * `principalLabel`: the Run's pack's principal entity label, for the World diff's reads counter.
 * `injectedLabel`: the same pack's label for the collection this Run's Attack injected into, for a
 * Violation's "Source:" line. Both resolved server-side; both `""` when the pack is unavailable.
 */
export type RunViewProps = { run: RunRecord | null; packs: PackOption[]; tools: Record<string, ToolDef>; principalLabel: string; injectedLabel: string; recent: RunSummary[] };

export function RunView({ run, packs, tools, principalLabel, injectedLabel, recent }: RunViewProps) {
  const [diffOpen, setDiffOpen] = useState(false);
  const replay = useReplay(run);
  // Flow is the default view; List keeps the Timeline. Both read the same `visible`, so the
  // Replay scrubber drives whichever one is showing.
  const flow = useFlowState();

  // Narrative (Opus-written explanation) is generated after a Run completes, off the critical path.
  // useRun's polling freezes `run` at the first "completed" snapshot (narrative: null) and never
  // re-fetches it, so router.refresh() alone would not surface a narrative written after that point —
  // re-fetch the Run once here instead and hold the narrative in local state.
  const [narrative, setNarrative] = useState<{ id: string; text: string | null } | null>(null);
  const requestedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!run || run.status !== "completed" || run.narrative || run.agent.kind === "byo") return;
    if (recent.find((s) => s.id === run.id)?.golden === true) return; // golden Runs are canned demo data — never a live model call
    if (requestedFor.current === run.id) return;
    requestedFor.current = run.id;
    const runId = run.id;
    fetch(`/api/runs/${runId}/narrative`, { method: "POST" })
      .then(() => fetch(`/api/runs/${runId}`, { cache: "no-store" }))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: RunRecord | null) => setNarrative({ id: runId, text: data?.narrative ?? null }))
      .catch(() => {});
  }, [run, recent]);

  const displayRun = run && narrative && narrative.id === run.id ? { ...run, narrative: narrative.text } : run;

  return (
    <div className="min-h-screen text-sm">
      <Header run={displayRun} />
      <div className="grid grid-cols-[240px_1fr_400px] gap-4 p-4 h-[calc(100vh-48px)]">
        <aside className="flex flex-col gap-4">
          <Launcher packs={packs} run={displayRun} onPromptDiff={() => setDiffOpen(true)} />
          <ConnectAgent run={displayRun} />
          <RecentRuns runs={recent} currentId={displayRun?.id ?? null} />
        </aside>
        <main className={`${panel} flex flex-col overflow-hidden`}>
          {displayRun ? (
            <>
              <FlowToolbar state={flow} tools={tools} />
              {flow.view === "flow" ? (
                <FlowView
                  run={displayRun}
                  visible={replay.visible}
                  selectedSeq={flow.selected}
                  onSelect={flow.select}
                  filters={flow.filters}
                  follow={flow.follow}
                  fitSignal={flow.fitSignal}
                  tools={tools}
                  injectedLabel={injectedLabel}
                />
              ) : (
                <Timeline run={displayRun} visible={replay.visible} tools={tools} injectedLabel={injectedLabel} />
              )}
              {displayRun.status !== "running" && <ReplayScrubber replay={replay} />}
            </>
          ) : <div className="p-6 text-[#6b6b66]">Pick a Scenario and press Run.</div>}
        </main>
        <aside className="flex flex-col gap-4">
          <ScorePanel run={displayRun} replaying={replay.replaying} />
          <DiffPanel run={displayRun} principalLabel={principalLabel} />
        </aside>
      </div>
      <PromptDiffSheet open={diffOpen} onClose={() => setDiffOpen(false)} run={displayRun} />
    </div>
  );
}
