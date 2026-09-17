// Waves: the tool calls a Run made concurrently, drawn side by side (CONTEXT.md "Wave"). Pure and
// browser-safe — type-only engine imports — so the Run page's flow strip can import it directly.
import type { Event } from "@/engine/types";

export type Wave = { batchId: string | null; maxEndedAt: number; seqs: number[] };

/**
 * Groups `events` (assumed already in `seq` order) into waves of concurrent tool calls: an Event
 * joins the current wave when it shares the wave's non-null `batchId`, or when it started before
 * the wave's latest finish so far (`startedAt < maxEndedAt`, i.e. it overlapped in wall-clock time
 * with something already in the wave). Otherwise it starts a new wave. `maxEndedAt` keeps tracking
 * the wave's latest finish as it grows, so a third Event can join purely because it overlaps the
 * wave's running end time, not just its immediate predecessor.
 */
export function groupWaves(events: Event[]): Wave[] {
  const waves: Wave[] = [];
  for (const e of events) {
    const wave = waves[waves.length - 1];
    const joins = wave !== undefined && ((e.batchId !== null && e.batchId === wave.batchId) || e.startedAt < wave.maxEndedAt);
    if (wave && joins) {
      wave.seqs.push(e.seq);
      wave.maxEndedAt = Math.max(wave.maxEndedAt, e.endedAt);
    } else {
      waves.push({ batchId: e.batchId, maxEndedAt: e.endedAt, seqs: [e.seq] });
    }
  }
  return waves;
}
