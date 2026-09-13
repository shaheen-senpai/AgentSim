"use client";
import { useEffect, useState } from "react";
import type { RunRecord } from "./types";

/** Polls GET /api/runs/:id every `intervalMs` while the Run is running; stops when it completes or fails. */
export function useRun(id: string | null, intervalMs = 500): { run: RunRecord | null; error: string | null } {
  const [run, setRun] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resetting on id change, not a derived-state loop
    if (!id) { setRun(null); return; }
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      try {
        const res = await fetch(`/api/runs/${id}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as RunRecord;
        if (stopped) return;
        setRun(data);
        setError(null);
        if (data.status === "running") timer = setTimeout(tick, intervalMs);
      } catch (e) {
        if (stopped) return;
        setError(e instanceof Error ? e.message : String(e));
        timer = setTimeout(tick, intervalMs * 4);
      }
    };
    void tick();
    return () => { stopped = true; if (timer) clearTimeout(timer); };
  }, [id, intervalMs]);

  return { run, error };
}
