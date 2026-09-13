"use client";
import type { Replay } from "./useReplay";
import { mono } from "./styles";

export function ReplayScrubber({ replay }: { replay: Replay }) {
  const { visible, total, playing, speed } = replay;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-t border-[#cfcfcb] bg-[#fafaf8]">
      <button type="button" onClick={playing ? replay.pause : replay.play} className="h-7 w-9 border border-[#1d1d1b] rounded bg-white text-xs" aria-label={playing ? "Pause replay" : "Play replay"}>
        {playing ? "❚❚" : "▷"}
      </button>
      <span className={`${mono} text-xs w-16`}>#{visible} / {total}</span>
      <input type="range" min={0} max={total} value={visible} onChange={(e) => replay.seek(Number(e.target.value))} className="flex-1 accent-[#1d1d1b]" aria-label="Replay position" />
      <button type="button" onClick={() => replay.setSpeed(speed === 1 ? 2 : 1)} className="text-xs text-[#6b6b66]">Replay · {speed}×</button>
    </div>
  );
}
