import type { Event, ToolDef } from "./types";
import { fmtArgs, summarizeResult } from "./format";
import { mono } from "./styles";

export function EventRow({ ev, tool, elapsed, bad, id }: { ev: Event; tool?: ToolDef; elapsed: string; bad: boolean; id: string }) {
  return (
    <div id={id} className={`grid grid-cols-[32px_1fr_auto] gap-3 items-start px-3 py-2 border-t border-[#E3E0D5] ${bad ? "bg-[#FBEAE7] border-l-[3px] border-l-[#B23A22]" : ""}`}>
      <div className="text-xs text-[#6E6B60] pt-0.5 flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${ev.isError || bad ? "bg-[#B23A22]" : "bg-[#1E7A43]"}`} />#{ev.seq}
      </div>
      <div>
        <div className="text-[13px]"><span className={`${mono} font-semibold`}>{ev.tool}</span> <span className={`${mono} text-[#6E6B60]`}>{fmtArgs(ev.input, tool)}</span></div>
        <div className="text-xs text-[#6E6B60] mt-0.5">{summarizeResult(tool, ev)}</div>
        {ev.injected && (
          <div role="note" className="mt-1.5 p-2 bg-[#FBEAE7] border-l-[3px] border-[#B23A22] text-xs">
            <div className="text-[11px] uppercase tracking-[.08em] font-semibold text-[#B23A22] mb-1">Injected by Attack · {ev.injected.attackId}</div>
            <div className="text-[#6E6B60]">
              {ev.injected.collection} <span className={mono}>{ev.injected.id}</span> · field <span className={mono}>{ev.injected.field}</span>
            </div>
          </div>
        )}
      </div>
      <div className="text-[11px] text-[#6E6B60] pt-0.5">{elapsed}</div>
    </div>
  );
}
