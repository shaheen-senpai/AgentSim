"use client";
// Replay controls under the flow strip, in the mock's toolbar vocabulary: play/pause, the position,
// a scrubber and the speed toggle. `useReplay` owns the state.
import type { Replay } from "@/ui/useReplay";

export function ReplayBar({ replay }: { replay: Replay }) {
  const { visible, total, playing, speed } = replay;
  return (
    <div className="run-toolbar" style={{ borderBottom: "none", borderTop: "1px solid var(--border)", background: "var(--bg)" }}>
      <div className="tglgrp">
        <button type="button" className="active" onClick={playing ? replay.pause : replay.play} aria-label={playing ? "Pause replay" : "Play replay"} style={{ width: 36 }}>
          {playing ? "❚❚" : "▷"}
        </button>
      </div>
      <span className="mono" style={{ fontSize: 11, minWidth: 64 }}>
        #{visible} / {total}
      </span>
      <input type="range" min={0} max={total} value={visible} onChange={(e) => replay.seek(Number(e.target.value))} style={{ flex: 1, accentColor: "var(--ink)" }} aria-label="Replay position" />
      <button type="button" onClick={() => replay.setSpeed(speed === 1 ? 2 : 1)} style={{ border: "none", background: "none", fontSize: 11, color: "var(--muted)" }}>
        Replay · {speed}×
      </button>
    </div>
  );
}
