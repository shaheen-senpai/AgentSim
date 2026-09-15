import { describe, expect, it } from "vitest";
import { idleLabel, idleRemainingMs, mmss } from "@/ui/idle";

const createdAt = "2026-09-15T12:00:00.000Z";
const created = Date.parse(createdAt);

describe("idleRemainingMs", () => {
  it("counts down from the Run's creation while there are no Events yet", () => {
    const run = { idleTimeoutMs: 120_000, createdAt, events: [] };
    expect(idleRemainingMs(run, created + 30_000)).toBe(90_000);
  });

  it("counts down from the last Event's endedAt once the agent has done something", () => {
    const run = {
      idleTimeoutMs: 120_000,
      createdAt,
      events: [{ endedAt: created + 10_000 }, { endedAt: created + 40_000 }],
    };
    expect(idleRemainingMs(run, created + 60_000)).toBe(100_000);
  });

  it("goes negative once the deadline has passed — the timer, not the label, decides", () => {
    const run = { idleTimeoutMs: 30_000, createdAt, events: [] };
    expect(idleRemainingMs(run, created + 45_000)).toBe(-15_000);
  });

  it("is null when the Run has no idle timeout", () => {
    expect(idleRemainingMs({ idleTimeoutMs: null, createdAt, events: [] }, created)).toBeNull();
  });
});

describe("mmss", () => {
  it("renders whole seconds, rounding up so a countdown never shows a second early", () => {
    expect(mmss(0)).toBe("0:00");
    expect(mmss(1)).toBe("0:01");
    expect(mmss(9_400)).toBe("0:10");
    expect(mmss(59_000)).toBe("0:59");
    expect(mmss(60_000)).toBe("1:00");
    expect(mmss(125_000)).toBe("2:05");
    expect(mmss(600_000)).toBe("10:00");
  });

  it("clamps a passed deadline at 0:00 rather than counting backwards", () => {
    expect(mmss(-5_000)).toBe("0:00");
  });
});

describe("idleLabel", () => {
  it("is the countdown as shown, or null when there is nothing to count down to", () => {
    expect(idleLabel({ idleTimeoutMs: 120_000, createdAt, events: [] }, created + 5_000)).toBe("1:55");
    expect(idleLabel({ idleTimeoutMs: null, createdAt, events: [] }, created)).toBeNull();
  });
});
