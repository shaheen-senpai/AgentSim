"use client";
import { focusRing } from "@/ui/styles";

export function StepStrip({ labels, current, onSelect }: { labels: string[]; current: number; onSelect: (step: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="New run steps">
      {labels.map((label, i) => {
        const state = i === current ? "current" : i < current ? "done" : "future";
        return (
          <div key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={i === current}
              disabled={state === "future"}
              onClick={() => onSelect(i)}
              className={`flex flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 pr-2 text-[12.5px] font-medium ${focusRing} ${
                state === "current"
                  ? "border-[#1B1A17] text-[#1B1A17] shadow-[0_0_0_1px_#1B1A17_inset]"
                  : state === "done"
                    ? "border-[#E3E0D5] text-[#1B1A17] disabled:cursor-default"
                    : "border-[#E3E0D5] text-[#6E6B60] cursor-not-allowed"
              }`}
            >
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold ${
                  state === "current" ? "bg-[#1B1A17] text-white" : state === "done" ? "bg-[#1E7A43] text-white" : "bg-[#E3E0D5] text-[#6E6B60]"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {label}
            </button>
            {i < labels.length - 1 && <div className="h-px w-4 flex-none bg-[#E3E0D5]" />}
          </div>
        );
      })}
    </div>
  );
}
