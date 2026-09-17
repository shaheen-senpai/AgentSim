import { describe, expect, it } from "vitest";
import { groupWaves } from "@/ui/waves";
import type { Event } from "@/engine/types";

function ev(seq: number, overrides: Partial<Event> = {}): Event {
  return {
    seq,
    toolUseId: `call-${seq}`,
    tool: "orders.get",
    input: {},
    result: JSON.stringify({ ok: true }),
    isError: false,
    changes: [],
    startedAt: seq * 1000,
    endedAt: seq * 1000 + 500,
    at: seq * 1000 + 500,
    source: "reference",
    batchId: null,
    injected: null,
    ...overrides,
  };
}

describe("groupWaves", () => {
  it("puts sequential, non-overlapping, unbatched Events in their own wave each", () => {
    const events = [
      ev(1, { startedAt: 0, endedAt: 500 }),
      ev(2, { startedAt: 1000, endedAt: 1500 }),
      ev(3, { startedAt: 2000, endedAt: 2500 }),
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([
      { batchId: null, maxEndedAt: 500, seqs: [1] },
      { batchId: null, maxEndedAt: 1500, seqs: [2] },
      { batchId: null, maxEndedAt: 2500, seqs: [3] },
    ]);
  });

  it("groups Events sharing a batchId into one wave, regardless of timing", () => {
    const events = [
      ev(1, { batchId: "turn-1", startedAt: 0, endedAt: 500 }),
      ev(2, { batchId: "turn-1", startedAt: 600, endedAt: 1000 }),
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([{ batchId: "turn-1", maxEndedAt: 1000, seqs: [1, 2] }]);
  });

  it("groups Events that overlap in time even with batchId: null (the time rule, independent of batch)", () => {
    const events = [
      ev(1, { batchId: null, startedAt: 0, endedAt: 1000 }),
      ev(2, { batchId: null, startedAt: 400, endedAt: 1400 }), // starts before #1 finishes
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([{ batchId: null, maxEndedAt: 1400, seqs: [1, 2] }]);
  });

  it("does not join two null-batchId Events that do not overlap in time", () => {
    const events = [
      ev(1, { batchId: null, startedAt: 0, endedAt: 500 }),
      ev(2, { batchId: null, startedAt: 500, endedAt: 900 }), // starts exactly at #1's end: not "<"
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([
      { batchId: null, maxEndedAt: 500, seqs: [1] },
      { batchId: null, maxEndedAt: 900, seqs: [2] },
    ]);
  });

  it("keeps growing maxEndedAt from the wave's latest finish, not just the last member", () => {
    // #2 finishes later than #3 started but #3 still overlaps the wave's running maxEndedAt.
    const events = [
      ev(1, { batchId: "t1", startedAt: 0, endedAt: 2000 }),
      ev(2, { batchId: "t1", startedAt: 100, endedAt: 300 }),
      ev(3, { batchId: null, startedAt: 1500, endedAt: 2500 }), // 1500 < maxEndedAt(2000)
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([{ batchId: "t1", maxEndedAt: 2500, seqs: [1, 2, 3] }]);
  });

  it("does not re-merge a batchId that reappears after a gap — only the current wave is checked", () => {
    // A(t1), B(t2), C(t1): C shares a batchId with A, but A's wave is no longer "current" once B
    // has started its own — and there's no time overlap either (all non-overlapping) — so C must
    // start a third wave, not merge back into A's.
    const events = [
      ev(1, { batchId: "t1", startedAt: 0, endedAt: 500 }),
      ev(2, { batchId: "t2", startedAt: 1000, endedAt: 1500 }),
      ev(3, { batchId: "t1", startedAt: 2000, endedAt: 2500 }),
    ];
    const waves = groupWaves(events);
    expect(waves).toEqual([
      { batchId: "t1", maxEndedAt: 500, seqs: [1] },
      { batchId: "t2", maxEndedAt: 1500, seqs: [2] },
      { batchId: "t1", maxEndedAt: 2500, seqs: [3] },
    ]);
  });
});

// ─────────────────────────────── buildFlow: basic shape ───────────────────────────────
