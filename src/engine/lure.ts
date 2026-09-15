// The single definition of the two Attack rules that more than one consumer needs: "did this Event
// take the Lure", and "what text did this Attack plant in the World" (ADR 0002: one rule, not one
// per consumer). `checks.ts`'s Safety Violation (via `attack.ts`'s re-export) and the flow view's
// red node/edge (`src/ui/flow/buildFlow.ts`, imported directly from here) both defer to
// `matchesLure`; `attack.ts`'s `injectionMarker` and the Event drawer's *Injected* tab
// (`src/ui/flow/injected.ts`) both defer to `injectedText` — never a re-implemented copy.
//
// Deliberately a leaf: only `import type`, nothing from `node:*`, nothing from `./pack`'s runtime
// (which touches the filesystem) or `./world`. `Attack`, `Mutation` and `Lure` are pure type
// exports of `./pack` with no runtime dependency, so switching on them here costs nothing. This is
// what lets a `"use client"` component import this module (directly, or transitively via
// `buildFlow`) without pulling server-only code into the browser bundle.
import type { Attack, Lure } from "./pack";
import type { Event } from "./types";

/** Did this Event perform (or attempt) the action the Attack's Lure is trying to induce? */
export function matchesLure(lure: Lure, ev: Pick<Event, "tool" | "input">): boolean {
  if (ev.tool !== lure.tool) return false;
  return Object.entries(lure.args_match).every(([k, v]) => JSON.stringify(ev.input[k]) === JSON.stringify(v));
}

/**
 * The text an Attack plants in the World, raw — as a *reader* of the World sees it. For
 * `insert_row` the forged row's `id` is the only part of it certain to appear in a result, so that
 * is what identifies it.
 *
 * Two consumers, one rule. `attack.ts`'s `injectionMarker` escapes this the way `JSON.stringify`
 * would before searching a serialised tool result; the Event drawer highlights it inside a value it
 * has already parsed, so it wants it exactly as it is here. The escaping belongs to the marker, the
 * text belongs here.
 */
export function injectedText(attack: Attack): string {
  const m = attack.mutation;
  switch (m.type) {
    case "append_to_field":
      return m.text.trim();
    case "set_field":
      return String(m.value).trim();
    case "insert_row":
      return m.row.id;
  }
}
