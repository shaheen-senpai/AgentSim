"use client";
import { RunView } from "./RunView";
import { useRun } from "./useRun";
import type { RunRecord, RunSummary, ScenarioSummary } from "./types";

export function RunPage({ id, initialRun, scenarios, recent }: { id: string | null; initialRun: RunRecord | null; scenarios: ScenarioSummary[]; recent: RunSummary[] }) {
  const { run, error } = useRun(id);
  return (
    <>
      {error && <div className="fixed top-14 right-4 z-10 text-xs bg-white border border-[#c8321e] text-[#c8321e] rounded px-2 py-1">polling: {error}</div>}
      <RunView run={run ?? initialRun} scenarios={scenarios} recent={recent} />
    </>
  );
}
