"use client";
import { useState } from "react";
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
  return (
    <div className="min-h-screen text-sm">
      <Header run={run} />
      <div className="grid grid-cols-[240px_1fr_400px] gap-4 p-4 h-[calc(100vh-48px)]">
        <aside className="flex flex-col gap-4">
          <Launcher scenarios={scenarios} run={run} onPromptDiff={() => setDiffOpen(true)} />
          <ConnectAgent run={run} />
          <RecentRuns runs={recent} currentId={run?.id ?? null} />
        </aside>
        <main className={`${panel} flex flex-col overflow-hidden`}>
          {run ? (
            <>
              <Timeline run={run} visible={replay.visible} />
              {run.status !== "running" && <ReplayScrubber replay={replay} />}
            </>
          ) : <div className="p-6 text-[#6b6b66]">Pick a Scenario and press Run.</div>}
        </main>
        <aside className="flex flex-col gap-4">
          <ScorePanel run={run} replaying={replay.replaying} />
          <DiffPanel run={run} />
        </aside>
      </div>
      <PromptDiffSheet open={diffOpen} onClose={() => setDiffOpen(false)} run={run} />
    </div>
  );
}
