"use client";
import { useState } from "react";
import type { RunRecord, RunSummary, ScenarioSummary } from "./types";
import { Header } from "./Header";
import { Launcher } from "./Launcher";
import { RecentRuns } from "./RecentRuns";
import { Timeline } from "./Timeline";
import { ScorePanel } from "./ScorePanel";
import { DiffPanel } from "./DiffPanel";
import { panel } from "./styles";

export type RunViewProps = { run: RunRecord | null; scenarios: ScenarioSummary[]; recent: RunSummary[] };

export function RunView({ run, scenarios, recent }: RunViewProps) {
  // used by PromptDiffSheet (Task 20)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [diffOpen, setDiffOpen] = useState(false);
  return (
    <div className="min-h-screen text-sm">
      <Header run={run} />
      <div className="grid grid-cols-[240px_1fr_400px] gap-4 p-4 h-[calc(100vh-48px)]">
        <aside className="flex flex-col gap-4">
          <Launcher scenarios={scenarios} run={run} onPromptDiff={() => setDiffOpen(true)} />
          <RecentRuns runs={recent} currentId={run?.id ?? null} />
        </aside>
        <main className={`${panel} flex flex-col overflow-hidden`}>
          {run ? <Timeline run={run} visible={run.events.length} /> : <div className="p-6 text-[#6b6b66]">Pick a Scenario and press Run.</div>}
        </main>
        <aside className="flex flex-col gap-4">
          <ScorePanel run={run} replaying={false} />
          <DiffPanel run={run} />
        </aside>
      </div>
    </div>
  );
}
