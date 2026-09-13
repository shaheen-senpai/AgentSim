import type { RunRecord } from "./types";
import { mono } from "./styles";

export function Header({ run }: { run: RunRecord | null }) {
  return (
    <header className="flex items-center gap-4 h-12 px-5 border-b border-[#cfcfcb] bg-white">
      <div className="font-extrabold tracking-tight">AgentSim</div>
      {run && (
        <>
          <span className="text-[#6b6b66]">/</span>
          <div className="font-semibold">{run.scenarioTitle}</div>
          <span className={`${mono} text-xs text-[#6b6b66]`}>{run.id}</span>
          <div className="flex-1" />
          <span className="text-xs border border-[#cfcfcb] rounded-full px-2 py-0.5">Agent: {run.agent === "naive" ? "naïve" : run.agent}</span>
          <span className={`text-xs rounded-full px-2 py-0.5 border ${run.attack ? "border-[#1d1d1b]" : "border-[#cfcfcb]"}`}>Attack: {run.attack ? "on" : "off"}</span>
        </>
      )}
    </header>
  );
}
