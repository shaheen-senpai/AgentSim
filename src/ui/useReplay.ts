"use client";
import { useEffect, useRef, useState } from "react";
import type { RunRecord } from "./types";

export type Replay = {
  visible: number; total: number; playing: boolean; replaying: boolean; speed: 1 | 2;
  play: () => void; pause: () => void; seek: (n: number) => void; setSpeed: (s: 1 | 2) => void;
};

const MAX_GAP_MS = 1500;

export function useReplay(run: RunRecord | null): Replay {
  const total = run?.events.length ?? 0;
  const [visible, setVisible] = useState(total);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const runId = run?.id ?? null;
  const following = run?.status === "running";

  // A new Run, or a live Run growing: show everything.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs visible to the Run's identity/length, not derivable at render time
  useEffect(() => { if (following || !playing) setVisible(total); }, [runId, total, following]); // eslint-disable-line react-hooks/exhaustive-deps

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!playing || !run) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- stops the playback timer when it reaches the end
    if (visible >= total) { setPlaying(false); return; }
    const gap = visible === 0 ? 300 : Math.min(MAX_GAP_MS, Math.max(150, run.events[visible].at - run.events[visible - 1].at));
    timer.current = setTimeout(() => setVisible((v) => v + 1), gap / speed);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [playing, visible, total, speed, run]);

  return {
    visible, total, playing, speed,
    replaying: visible < total,
    play: () => { if (visible >= total) setVisible(0); setPlaying(true); },
    pause: () => setPlaying(false),
    seek: (n) => { setPlaying(false); setVisible(Math.max(0, Math.min(total, n))); },
    setSpeed,
  };
}
