"use client";
import { useEffect, useRef, useState } from "react";
import type { RunRecord, RunSummary, ScenarioSummary } from "./types";
import { Header } from "./Header";
import { Launcher } from "./Launcher";
import { ConnectAgent } from "./ConnectAgent";
import { RecentRuns } from "./RecentRuns";
import { Timeline } from "./Timeline";
import { ScorePanel } from "./ScorePanel";
import { DiffPanel } from "./DiffPanel";
import { useReplay } from "./useReplay";
import { ReplayScrubber } from "./ReplayScrubber";
import { PromptDiffSheet } from "./PromptDiffSheet";
import { panel } from "./styles";

export type RunViewProps = { run: RunRecord | null; scenarios: ScenarioSummary[]; recent: RunSummary[] };

export function RunView({ run, scenarios, recent }: RunViewProps) {
  const [diffOpen, setDiffOpen] = useState(false);
  const replay = useReplay(run);

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
          <Launcher scenarios={scenarios} run={displayRun} onPromptDiff={() => setDiffOpen(true)} />
          <ConnectAgent run={displayRun} scenarios={scenarios} />
          <RecentRuns runs={recent} currentId={displayRun?.id ?? null} />
        </aside>
        <main className={`${panel} flex flex-col overflow-hidden`}>
          {displayRun ? (
            <>
              <Timeline run={displayRun} visible={replay.visible} />
              {displayRun.status !== "running" && <ReplayScrubber replay={replay} />}
            </>
          ) : <div className="p-6 text-[#6b6b66]">Pick a Scenario and press Run.</div>}
        </main>
        <aside className="flex flex-col gap-4">
          <ScorePanel run={displayRun} replaying={replay.replaying} />
          <DiffPanel run={displayRun} />
        </aside>
      </div>
      <PromptDiffSheet open={diffOpen} onClose={() => setDiffOpen(false)} run={displayRun} />
    </div>
  );
}
