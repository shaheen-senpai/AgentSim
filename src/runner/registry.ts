import type { Sim } from "@/sim/sim";
import type { RunRecord } from "./store";

type Live = { sim: Sim; run: RunRecord };
const g = globalThis as unknown as { __agentsimLive?: Map<string, Live> };
// On globalThis so `next dev` module re-evaluation does not lose in-flight Runs.
const live = (g.__agentsimLive ??= new Map<string, Live>());

export const registerLive = (id: string, sim: Sim, run: RunRecord): void => { live.set(id, { sim, run }); };
export const getLive = (id: string): Live | undefined => live.get(id);
export const unregisterLive = (id: string): void => { live.delete(id); };
