import { describe, expect, it } from "vitest";
import { PACKETS, PRISM_CYCLE, cycleProgress, phaseAt, prismScores } from "@/marketing/prismModel";

describe("prismScores", () => {
  it("is a clean pass with every dimension at 100 when not poisoned", () => {
    const s = prismScores(false);
    expect(s.status).toBe("Replay verified");
    expect(s.dimensions.map((d) => d.value)).toEqual([100, 100, 100]);
    expect(s.dimensions.every((d) => d.tone === "safe")).toBe(true);
    expect(s.trust).toBe(100);
    expect(s.tone).toBe("safe");
  });

  it("drops Mandate and Integrity but never Task when poisoned", () => {
    const s = prismScores(true);
    expect(s.status).toBe("Injection detected");
    expect(s.dimensions.map((d) => [d.label, d.value, d.tone])).toEqual([
      ["Task", 100, "safe"],
      ["Mandate", 18, "danger"],
      ["Integrity", 22, "danger"],
    ]);
    expect(s.trust).toBe(40);
    expect(s.tone).toBe("danger");
  });
});

describe("PACKETS", () => {
  it("has exactly one packet that carries the injection", () => {
    expect(PACKETS.filter((p) => p.danger)).toHaveLength(1);
    expect(PACKETS.find((p) => p.danger)?.detail).toContain("email footer");
  });
});

describe("phaseAt", () => {
  it("scans first, detects the injection, then verifies the clean replay, and loops", () => {
    expect(phaseAt(0)).toBe("scanning");
    expect(phaseAt(PRISM_CYCLE.detectAt - 1)).toBe("scanning");
    expect(phaseAt(PRISM_CYCLE.detectAt)).toBe("detected");
    expect(phaseAt(PRISM_CYCLE.verifyAt - 1)).toBe("detected");
    expect(phaseAt(PRISM_CYCLE.verifyAt)).toBe("verified");
    expect(phaseAt(PRISM_CYCLE.length)).toBe("scanning");
    expect(phaseAt(PRISM_CYCLE.length + PRISM_CYCLE.detectAt)).toBe("detected");
  });

  it("reports progress through the cycle as 0..1", () => {
    expect(cycleProgress(0)).toBe(0);
    expect(cycleProgress(PRISM_CYCLE.length / 2)).toBe(0.5);
    expect(cycleProgress(PRISM_CYCLE.length)).toBe(0);
  });
});
