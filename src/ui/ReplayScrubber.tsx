"use client";
import type { Replay } from "./useReplay";
import { mono } from "./styles";

export function ReplayScrubber({ replay }: { replay: Replay }) {
  const { visible, total, playing, speed } = replay;
  return (
    <div className="flex items-center gap-3 px-3 py-2.5 border-t border-[#E3E0D5] bg-[#F7F5EF]">
      <button type="button" onClick={playing ? replay.pause : replay.play} className="h-7 w-9 border border-[#1B1A17] rounded bg-white text-xs" aria-label={playing ? "Pause replay" : "Play replay"}>
        {playing ? "❚❚" : "▷"}
      </button>
      <span className={`${mono} text-xs w-16`}>#{visible} / {total}</span>
      <input type="range" min={0} max={total} value={visible} onChange={(e) => replay.seek(Number(e.target.value))} className="flex-1 accent-[#1B1A17]" aria-label="Replay position" />
      <button type="button" onClick={() => replay.setSpeed(speed === 1 ? 2 : 1)} className="text-xs text-[#6E6B60]">Replay · {speed}×</button>
    </div>
  );
}
