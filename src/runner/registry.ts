import type { Gateway } from "@/engine/gateway";
import type { WorldPack } from "@/engine/pack";
import type { RunRecord } from "./store";

type Idle = { ms: number; onFire: () => void; timer: ReturnType<typeof setTimeout> };
type Live = { gateway: Gateway; run: RunRecord; pack: WorldPack; idle?: Idle };

const g = globalThis as unknown as { __agentsimLive?: Map<string, Live> };
// On globalThis so `next dev` module re-evaluation does not lose in-flight Runs.
const live = (g.__agentsimLive ??= new Map<string, Live>());

export const registerLive = (id: string, gateway: Gateway, run: RunRecord, pack: WorldPack): void => {
  const prev = live.get(id);
  if (prev?.idle) clearTimeout(prev.idle.timer); // don't orphan a displaced entry's idle timer
  live.set(id, { gateway, run, pack });
};

export const getLive = (id: string): Live | undefined => live.get(id);

export const unregisterLive = (id: string): void => {
  const entry = live.get(id);
  if (entry?.idle) clearTimeout(entry.idle.timer);
  live.delete(id);
};

/**
 * (Re)starts this Run's idle timer. Lives here rather than in `run.ts` so the timer dies with the
 * live entry: `unregisterLive` is the single place a finished Run stops counting down.
 */
export function armIdle(id: string, ms: number, onFire: () => void): void {
  const entry = live.get(id);
  if (!entry) return;
  if (entry.idle) clearTimeout(entry.idle.timer);
  const timer = setTimeout(onFire, ms);
  // A pending Run must not hold a script or test process open.
  (timer as { unref?: () => void }).unref?.();
  entry.idle = { ms, onFire, timer };
}

/** Restarts the armed idle timer with the same interval — called for every Event on the Run. */
export function touchIdle(id: string): void {
  const idle = live.get(id)?.idle;
  if (idle) armIdle(id, idle.ms, idle.onFire);
}
