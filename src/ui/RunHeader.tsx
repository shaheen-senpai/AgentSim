import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "./types";
import { mono, serif } from "./styles";

export function RunHeader({ run }: { run: RunRecord }) {
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 pt-4">
      <span className="text-xs border border-[#E3E0D5] rounded-full px-2 py-0.5">{run.packName}</span>
      <div className={`${serif} text-[20px] font-medium truncate max-w-[420px]`}>{run.scenarioTitle}</div>
      <span className={`${mono} text-xs text-[#6E6B60]`}>{run.id}</span>
      <div className="flex-1" />
      <span className="text-xs border border-[#E3E0D5] rounded-full px-2 py-0.5">Agent: {agentLabel(run.agent)}</span>
      <span className={`text-xs rounded-full px-2 py-0.5 border ${run.attack ? "border-[#1B1A17]" : "border-[#E3E0D5]"}`}>Attack: {run.attack ? "on" : "off"}</span>
    </div>
  );
}
