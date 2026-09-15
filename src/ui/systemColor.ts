// Deterministic colour per System, keyed by the System's index in the pack's own sorted list of
// System keys — not by call order or Event order — so a colour never shifts when a Run is
// re-rendered, and stays the same across every place (chips, Flow nodes, badges) that draws it.
// Pure module: no React, no pack import (callers pass `Object.keys(pack.meta.systems)`).

const PALETTE = ["#3b6ea8", "#2f7d4f", "#b3661a", "#7a4fa3", "#1f8a8a", "#a83b6e", "#6b6b66", "#8a7a1f"];
const GREY = { bg: "#ececea", fg: "#6b6b66", stripe: "#6b6b66" };

export type SystemColor = { bg: string; fg: string; stripe: string };

/** `hex` mixed with white, keeping only `amount` (0..1) of the original colour. */
function tint(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 0xff;
    return Math.round(c * amount + 255 * (1 - amount));
  };
  return `#${[channel(16), channel(8), channel(0)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** `{ bg, fg, stripe }` for `system`, by its index in the sorted, de-duplicated `systems` list. */
export function systemColor(systems: string[], system: string): SystemColor {
  const sorted = [...new Set(systems)].sort();
  const index = sorted.indexOf(system);
  if (index === -1) return GREY;
  const hue = PALETTE[index % PALETTE.length];
  return { bg: tint(hue, 0.1), fg: hue, stripe: hue };
}
