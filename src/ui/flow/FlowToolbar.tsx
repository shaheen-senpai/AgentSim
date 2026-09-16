"use client";
import { useMemo } from "react";
import { systemsOf, type FlowState } from "./useFlowState";
import { systemColor } from "../systemColor";
import { dangerPill } from "../styles";
import type { ToolDef } from "../types";

const BTN = "h-6 rounded border px-2 text-[11px] leading-none";
const OFF = "border-[#E3E0D5] bg-white text-[#6E6B60] hover:text-[#1B1A17]";
const ON = "border-[#1B1A17] bg-[#1B1A17] text-white";

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
    <div className="border-b border-[#E3E0D5] px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded border border-[#1B1A17]" role="group" aria-label="View">
          {(["flow", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={state.view === v}
              onClick={() => state.setView(v)}
              className={`h-6 px-2.5 text-[11px] leading-none capitalize ${state.view === v ? "bg-[#1B1A17] text-white" : "bg-white text-[#6E6B60]"}`}
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
            <button type="button" onClick={state.clearSystems} className="text-[10px] text-[#6E6B60] underline underline-offset-2">all systems</button>
          )}
          <span className="ml-auto flex items-center gap-2 text-[9px] uppercase tracking-[.04em] text-[#6E6B60]">
            <span className={`${dangerPill} px-1 py-px font-semibold`}>Violation</span>
            <span className={`${dangerPill} px-1 py-px font-semibold ring-1 ring-inset ring-[#B23A22]`}>Lure taken</span>
            <span className="rounded-full border border-[#B23A22] bg-white px-1 py-px font-semibold text-[#B23A22]">reads injected content</span>
          </span>
        </div>
      )}
    </div>
  );
}
