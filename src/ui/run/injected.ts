// Locating an Attack's injected content inside the result the agent actually read — the data behind
// the Event drawer's injected-text section. Pure and framework-free, with no value import of
// `@/engine/attack` (which reaches `node:fs` through `@/engine/pack`); the one rule for *what* an
// Attack planted lives in the leaf `@/engine/lure` and is re-exported here so the drawer has a single
// import for everything about the injection. `tests/ui/injected.test.ts`; the import-purity guard in
// `tests/ui/uiGuards.test.ts` covers this file.
export { injectedText } from "@/engine/lure";

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
