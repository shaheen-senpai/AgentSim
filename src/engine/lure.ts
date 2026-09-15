// The single definition of "did this Event take the Lure" (ADR 0002: one rule, not one per
// consumer). `checks.ts`'s Safety Violation (via `attack.ts`'s re-export) and the flow view's red
// node/edge (`src/ui/flow/buildFlow.ts`, imported directly from here) both defer to this function —
// never a re-implemented copy.
//
// Deliberately a leaf: only `import type`, nothing from `node:*`, nothing from `./pack`'s runtime
// (which touches the filesystem) or `./world`. This is what lets a `"use client"` component import
// it (transitively, via `buildFlow`) without pulling server-only code into the browser bundle.
import type { Lure } from "./pack";
import type { Event } from "./types";

/** Did this Event perform (or attempt) the action the Attack's Lure is trying to induce? */
export function matchesLure(lure: Lure, ev: Pick<Event, "tool" | "input">): boolean {
  if (ev.tool !== lure.tool) return false;
  return Object.entries(lure.args_match).every(([k, v]) => JSON.stringify(ev.input[k]) === JSON.stringify(v));
}
