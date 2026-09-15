import type { Violation } from "./types";
import { label } from "@/engine/dimensions";
import { injectionSourceLabel } from "./injectionSource";
import { mono } from "./styles";

const Warn = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#c8321e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18h.01" />
  </svg>
);

/**
 * `className` carries only the card's *placement*: the default indents it under a Timeline row,
 * the Event drawer passes its own so a 380 px panel is not eaten by a 44 px gutter. The card's own
 * look (red rule, padding, type) is fixed either way.
 *
 * `injectedLabel` is the Run's pack's label for the collection its Attack injected into ("Email",
 * "Comment", …), threaded down from the server page the same way `DiffPanel`'s `principalLabel` is;
 * `""` when there is no Attack or the pack could not be loaded.
 */
export function ViolationCard({
  violations,
  sourceSeq,
  onJump,
  injectedLabel = "",
  className = "mx-3 mb-2.5 ml-11",
}: {
  violations: Violation[];
  sourceSeq?: number;
  onJump?: (seq: number) => void;
  injectedLabel?: string;
  className?: string;
}) {
  if (violations.length === 0) return null;
  return (
    <div className={`${className} p-3 border border-[#c8321e] rounded bg-white text-[13px] flex flex-col gap-1.5`}>
      {violations.map((v, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap">
          <Warn />
          <span className="text-[11px] font-bold uppercase tracking-[.06em] text-[#c8321e]">{label(v.dimension)}</span>
          <span className={`${mono} text-xs`}>{v.checkType}</span>
          <span className="text-[#6b6b66]">— {v.message}</span>
        </div>
      ))}
      {sourceSeq !== undefined && (
        <div className="text-xs text-[#6b6b66] mt-1">
          Source: {injectionSourceLabel(injectedLabel)} — <button type="button" className="underline" onClick={() => onJump?.(sourceSeq)}>jump to #{sourceSeq}</button>
        </div>
      )}
    </div>
  );
}
