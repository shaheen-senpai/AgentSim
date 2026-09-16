"use client";
import { RunView } from "./RunView";
import { useRun } from "./useRun";
import type { PackOption, RunRecord, RunSummary, ToolDef } from "./types";

export function RunPage({ id, initialRun, packs, tools, principalLabel, injectedLabel, recent }: { id: string | null; initialRun: RunRecord | null; packs: PackOption[]; tools: Record<string, ToolDef>; principalLabel: string; injectedLabel: string; recent: RunSummary[] }) {
  const { run, error } = useRun(id);
  return (
    <>
      {error && <div className="fixed top-14 right-4 z-10 text-xs bg-white border border-[#B23A22] text-[#B23A22] rounded px-2 py-1">polling: {error}</div>}
      <RunView run={run ?? initialRun} packs={packs} tools={tools} principalLabel={principalLabel} injectedLabel={injectedLabel} recent={recent} />
    </>
  );
}
