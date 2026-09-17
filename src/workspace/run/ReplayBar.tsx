"use client";
// Replay controls under the flow: play/pause, the position, a scrubber and the speed toggle.
// `useReplay` owns the state.
import { Icon } from "@/marketing/icons";
import type { Replay } from "@/ui/useReplay";

export function ReplayBar({ replay }: { replay: Replay }) {
  const { visible, total, playing, speed } = replay;
  return (
    <div className="flex items-center gap-3 border-t border-border bg-background px-3.5 py-2.5">
      <button
        type="button"
        onClick={playing ? replay.pause : replay.play}
        aria-label={playing ? "Pause replay" : "Play replay"}
        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-control bg-primary text-primary-foreground transition-colors duration-200 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" fill="currentColor" className="size-4" aria-hidden><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
        ) : (
          <Icon name="play" className="size-4" />
        )}
      </button>
      <span className="min-w-16 font-label text-caption tabular-nums text-foreground">
        #{visible} / {total}
      </span>
      <input
        type="range"
        min={0}
        max={total}
        value={visible}
        onChange={(e) => replay.seek(Number(e.target.value))}
        aria-label="Replay position"
        className="h-1 flex-1 cursor-pointer accent-primary"
      />
      <button type="button" onClick={() => replay.setSpeed(speed === 1 ? 2 : 1)} className="cursor-pointer rounded-control px-2 py-1 font-label text-[11px] text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
        Replay · {speed}×
      </button>
    </div>
  );
}
