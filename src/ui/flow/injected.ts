// Locating an Attack's injected content inside the result the agent actually read — the data behind
// the Event drawer's *Injected* tab (spec §6.1: "the injected text with the rest of the field around
// it"). Pure and framework-free so it can be unit-tested without a DOM, and — exactly like
// `buildFlow.ts` — with no value import of `@/engine/attack`, whose `injectionMarker` /
// `injectedTarget` this restates: that module reaches `node:fs` through `@/engine/pack`, and this
// one is imported from a `"use client"` component. The import-purity test in
// `tests/ui/buildFlow.test.ts` covers this file too.
import type { Attack } from "@/engine/pack";

/**
 * The text an Attack plants in the World, as a *reader* of the World sees it — the same three
 * mutation shapes `@/engine/attack`'s `injectionMarker` knows, minus its JSON escaping (we search a
 * parsed result, where the raw text is what matches). For `insert_row` the forged row's `id` is the
 * only part of it we can be sure appears in a result, so that is what gets highlighted.
 */
export function injectedText(attack: Attack): string {
  const m = attack.mutation;
  if (m.type === "append_to_field") return m.text.trim();
  if (m.type === "set_field") return String(m.value).trim();
  return m.row.id;
}

/** A field value from an Event's result, split around the injected text it contains. */
export type InjectionContext = {
  before: string;
  match: string;
  after: string;
  /** The object key the value sat under — usually, but not necessarily, the Attack's own `field`. */
  key: string;
};

type Candidate = { rank: number; key: string; value: string };

/**
 * Finds `text` inside `result` (an Event's raw result string) and returns the whole surrounding
 * field value split around it, so the drawer can show the poison in context rather than on its own.
 *
 * A read tool is free to nest or reshape the row it returns, so this walks the parsed result rather
 * than indexing into it, and ranks what it finds: a value on the Attack's own row (`id`) beats one
 * merely stored under the Attack's own `field`, which beats any other string that happens to
 * contain the text. `null` when the result is missing, is not JSON, or contains no such string —
 * the caller then shows the injected text alone and says so.
 */
export function locateInjection(
  result: string | undefined,
  target: { id: string; field: string },
  text: string,
): InjectionContext | null {
  if (!result || !text) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    return null;
  }

  const found: Candidate[] = [];
  const walk = (node: unknown, key: string, onTargetRow: boolean): void => {
    if (typeof node === "string") {
      if (node.includes(text)) found.push({ rank: (onTargetRow ? 2 : 0) + (key === target.field ? 1 : 0), key, value: node });
      return;
    }
    if (Array.isArray(node)) {
      // An array inherits its key: `{ emails: [{ body: … }] }` reaches `body` with the row's own key.
      for (const item of node) walk(item, key, onTargetRow);
      return;
    }
    if (node === null || typeof node !== "object") return;
    const row = node as Record<string, unknown>;
    const here = row.id === target.id;
    for (const [k, v] of Object.entries(row)) walk(v, k, here);
  };
  walk(parsed, "", false);

  if (found.length === 0) return null;
  // First-found wins a tie, so the earliest occurrence in the result is the one shown.
  const best = found.reduce((a, b) => (b.rank > a.rank ? b : a));
  const at = best.value.indexOf(text);
  return { before: best.value.slice(0, at), match: text, after: best.value.slice(at + text.length), key: best.key };
}
