"use client";
import type { RunRecord, RunSummary, ScenarioSummary } from "./types";
import { Header } from "./Header";
import { panel, heading } from "./styles";

export type RunViewProps = { run: RunRecord | null; scenarios: ScenarioSummary[]; recent: RunSummary[] };

export function RunView({ run, scenarios, recent }: RunViewProps) {
  return (
    <div className="min-h-screen text-sm">
      <Header run={run} />
      <div className="grid grid-cols-[240px_1fr_400px] gap-4 p-4 h-[calc(100vh-48px)]">
        <aside className="flex flex-col gap-4">
          <section className={`${panel} p-4`}><div className={heading}>Launcher</div><p className="text-[#6b6b66] mt-2">{scenarios.length} scenarios</p></section>
          <section className={`${panel} p-4 flex-1`}><div className={heading}>Recent runs</div><p className="text-[#6b6b66] mt-2">{recent.length} runs</p></section>
        </aside>
        <main className={`${panel} flex flex-col overflow-hidden`}>
          <div className={`${heading} px-3 py-2.5`}>Timeline{run ? ` · ${run.events.length} events` : ""}</div>
        </main>
        <aside className="flex flex-col gap-4">
          <section className={`${panel} p-4`}><div className={heading}>Trust Score</div></section>
          <section className={`${panel} flex-1`}><div className={`${heading} px-3 py-2.5`}>World diff · start → end</div></section>
        </aside>
      </div>
    </div>
  );
}
