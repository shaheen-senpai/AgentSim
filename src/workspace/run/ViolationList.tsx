"use client";
// The Violations on one Event, with a jump to where the injected content was actually read.
import { label } from "@/engine/dimensions";
import { Icon } from "@/marketing/icons";
import { injectionSourceLabel } from "@/ui/injectionSource";
import type { Violation } from "@/ui/types";

export function ViolationList({ violations, sourceSeq, onJump, injectedLabel = "" }: { violations: Violation[]; sourceSeq?: number; onJump?: (seq: number) => void; injectedLabel?: string }) {
  if (violations.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-panel border border-danger/50 border-l-2 border-l-danger bg-danger/5 p-3 text-caption">
      {violations.map((v, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <Icon name="alert" className="size-3.5 shrink-0 text-danger" />
          <span className="font-label text-[10px] font-bold uppercase tracking-[0.06em] text-danger">{label(v.dimension)}</span>
          <span className="font-label text-[11px] text-foreground">{v.checkType}</span>
          <span className="text-muted-foreground">— {v.message}</span>
        </div>
      ))}
      {sourceSeq !== undefined && (
        <p className="mt-1 text-muted-foreground">
          Source: {injectionSourceLabel(injectedLabel)} —{" "}
          <button type="button" onClick={() => onJump?.(sourceSeq)} className="cursor-pointer text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">jump to #{sourceSeq}</button>
        </p>
      )}
    </div>
  );
}
