"use client";
import { useMemo } from "react";
import { systemsOf, type FlowState } from "./useFlowState";
import { systemColor } from "../systemColor";
import type { ToolDef } from "../types";

const BTN = "h-6 rounded border px-2 text-[11px] leading-none";
const OFF = "border-[#cfcfcb] bg-white text-[#6b6b66] hover:text-[#1d1d1b]";
const ON = "border-[#1d1d1b] bg-[#1d1d1b] text-white";

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`${BTN} ${on ? ON : OFF}`}>
      {children}
    </button>
  );
}

/** Flow | List, the System filter chips, *writes only*, *follow live*, *fit*, and the badge legend. */
export function FlowToolbar({ state, tools }: { state: FlowState; tools: Record<string, ToolDef> }) {
  const systems = useMemo(() => systemsOf(tools), [tools]);
  const flow = state.view === "flow";

  return (
    <div className="border-b border-[#e6e6e2] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-[#1d1d1b]" role="group" aria-label="View">
          {(["flow", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={state.view === v}
              onClick={() => state.setView(v)}
              className={`h-6 px-2.5 text-[11px] leading-none capitalize ${state.view === v ? "bg-[#1d1d1b] text-white" : "bg-white text-[#6b6b66]"}`}
            >
              {v}
            </button>
          ))}
        </div>
        {flow && (
          <>
            <Toggle on={state.filters.writesOnly} onClick={() => state.setWritesOnly(!state.filters.writesOnly)}>writes only</Toggle>
            <Toggle on={state.follow} onClick={() => state.setFollow(!state.follow)}>follow live</Toggle>
            <button type="button" onClick={state.fit} className={`${BTN} ${OFF}`}>fit</button>
          </>
        )}
      </div>
      {flow && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {systems.map((s) => {
            const c = systemColor(systems, s);
            const on = state.filters.systems.has(s);
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                onClick={() => state.toggleSystem(s)}
                className="h-5 rounded-sm border px-1.5 text-[10px] font-semibold uppercase leading-none tracking-[.04em]"
                style={on ? { background: c.stripe, color: "#fff", borderColor: c.stripe } : { background: c.bg, color: c.fg, borderColor: "transparent" }}
              >
                {s}
              </button>
            );
          })}
          {state.filters.systems.size > 0 && (
            <button type="button" onClick={state.clearSystems} className="text-[10px] text-[#6b6b66] underline underline-offset-2">all systems</button>
          )}
          <span className="ml-auto flex items-center gap-2 text-[9px] uppercase tracking-[.04em] text-[#6b6b66]">
            <span className="rounded-sm bg-[#fbeeea] px-1 py-px font-semibold text-[#c8321e]">Violation</span>
            <span className="rounded-sm bg-[#c8321e] px-1 py-px font-semibold text-white">Lure taken</span>
            <span className="rounded-sm border border-[#c8321e] bg-white px-1 py-px font-semibold text-[#c8321e]">reads injected content</span>
          </span>
        </div>
      )}
    </div>
  );
}
