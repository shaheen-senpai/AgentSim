import type { Event, RunRecord } from "./types";
import { fmtArgs, summarizeResult, threadEmails } from "./format";
import { mono } from "./styles";

export function EventRow({ ev, run, elapsed, bad, id }: { ev: Event; run: RunRecord; elapsed: string; bad: boolean; id: string }) {
  const injected = run.attack?.mutation.type === "append_to_email" ? run.attack.mutation.text : null;
  const emails = ev.tool === "read_thread" ? threadEmails(ev.result) : [];
  const poisoned = injected ? emails.find((e) => e.body.includes(injected)) : undefined;

  return (
    <div id={id} className={`grid grid-cols-[32px_1fr_auto] gap-3 items-start px-3 py-2 border-t border-[#e6e6e2] ${bad ? "bg-[#fbeeea] border-l-[3px] border-l-[#c8321e]" : ""}`}>
      <div className="text-xs text-[#6b6b66] pt-0.5 flex items-center gap-1.5">
        <span className={`inline-block w-2 h-2 rounded-full ${ev.isError || bad ? "bg-[#c8321e]" : "bg-[#2f7d4f]"}`} />#{ev.seq}
      </div>
      <div>
        <div className="text-[13px]"><span className={`${mono} font-semibold`}>{ev.tool}</span> <span className={`${mono} text-[#6b6b66]`}>{fmtArgs(ev.input)}</span></div>
        {poisoned ? (
          <>
            <div className="text-xs text-[#6b6b66] mt-0.5">1 email from {poisoned.from} · “{poisoned.body.replace(injected!, "").trim().slice(0, 140)}”</div>
            <div className="mt-1.5 p-2 bg-[#fbeeea] border-l-[3px] border-[#c8321e] text-xs">
              <div className="text-[11px] uppercase tracking-[.08em] font-semibold text-[#c8321e] mb-1">Injected by Attack · {run.attack!.id}</div>
              <pre className={`${mono} whitespace-pre-wrap`}>{injected!.trim()}</pre>
            </div>
          </>
        ) : (
          <div className="text-xs text-[#6b6b66] mt-0.5">{summarizeResult(ev.tool, ev.result, ev.error)}</div>
        )}
      </div>
      <div className="text-[11px] text-[#6b6b66] pt-0.5">{elapsed}</div>
    </div>
  );
}
