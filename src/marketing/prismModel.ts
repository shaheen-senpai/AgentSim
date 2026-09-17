// The Mandate prism's illustrative model: one seeded Scenario replayed clean and poisoned. Pure
// data and functions so the hero's animation can be reasoned about (and tested) without React.

export type Tone = "safe" | "danger";

export type Packet = {
  id: string;
  verb: "read" | "verify" | "write";
  detail: string;
  /** The one record that carries the injection; it turns red only in the poisoned replay. */
  danger: boolean;
};

export const PACKETS: readonly Packet[] = [
  { id: "p1", verb: "read", detail: "order #1042", danger: false },
  { id: "p2", verb: "verify", detail: "refund £49.99", danger: false },
  { id: "p3", verb: "read", detail: "email footer", danger: true },
  { id: "p4", verb: "write", detail: "card ••9027", danger: false },
];

export type Dimension = { label: "Task" | "Mandate" | "Integrity"; value: number; tone: Tone };

export type PrismScores = {
  status: "Replay verified" | "Injection detected";
  dimensions: readonly Dimension[];
  trust: number;
  tone: Tone;
};

export function prismScores(poisoned: boolean): PrismScores {
  if (!poisoned) {
    return {
      status: "Replay verified",
      dimensions: [
        { label: "Task", value: 100, tone: "safe" },
        { label: "Mandate", value: 100, tone: "safe" },
        { label: "Integrity", value: 100, tone: "safe" },
      ],
      trust: 100,
      tone: "safe",
    };
  }
  return {
    status: "Injection detected",
    dimensions: [
      { label: "Task", value: 100, tone: "safe" },
      { label: "Mandate", value: 18, tone: "danger" },
      { label: "Integrity", value: 22, tone: "danger" },
    ],
    trust: 40,
    tone: "danger",
  };
}

/**
 * The prism runs on its own: it scans the shift's records, the injected one reaches the core and
 * trips the detection, the verdict holds for a moment, then the replay verifies clean and the
 * cycle starts again. All times in ms from the start of a cycle.
 */
export type PrismPhase = "scanning" | "detected" | "verified";

export const PRISM_CYCLE = {
  detectAt: 3200,
  verifyAt: 7600,
  length: 10000,
} as const;

export function phaseAt(elapsedMs: number): PrismPhase {
  const t = ((elapsedMs % PRISM_CYCLE.length) + PRISM_CYCLE.length) % PRISM_CYCLE.length;
  if (t < PRISM_CYCLE.detectAt) return "scanning";
  if (t < PRISM_CYCLE.verifyAt) return "detected";
  return "verified";
}

/** 0..1 progress through the current cycle, for the scan progress line. */
export function cycleProgress(elapsedMs: number): number {
  return (((elapsedMs % PRISM_CYCLE.length) + PRISM_CYCLE.length) % PRISM_CYCLE.length) / PRISM_CYCLE.length;
}

export const PHASE_STATUS: Record<PrismPhase, string> = {
  scanning: "Scanning shift…",
  detected: "Injection detected",
  verified: "Replay verified",
};
