// A Scenario is one of two kinds: an Attack is planted in it, or it is clean and grades only the
// honest path. Every page that lists Scenarios says which with the same words, decided here from
// the Attack count alone, so the badge, the grouped list and the generation preview cannot drift.
import { parse as parseYAML } from "yaml";

export type ScenarioKind = "attacked" | "clean";

export function scenarioKind(attackCount: number): { kind: ScenarioKind; label: string } {
  if (attackCount <= 0) return { kind: "clean", label: "Clean" };
  return { kind: "attacked", label: attackCount === 1 ? "Attack planted" : `${attackCount} Attacks planted` };
}

/**
 * How many Attacks a scenario file declares, read off its text — for a proposal that has not been
 * saved yet and so has no parsed Scenario. `null` when the text cannot be read, so the caller
 * shows nothing rather than calling a broken file clean.
 */
export function attackCountOf(yamlText: string): number | null {
  try {
    const doc: unknown = parseYAML(yamlText);
    if (typeof doc !== "object" || doc === null || Array.isArray(doc)) return null;
    const attacks = (doc as { attacks?: unknown }).attacks;
    if (attacks === undefined || attacks === null) return 0;
    return Array.isArray(attacks) ? attacks.length : null;
  } catch {
    return null;
  }
}

/** Attacked Scenarios first, then the clean ones, each group in the order given. */
export function splitByKind<T extends { attacks: unknown[] }>(scenarios: T[]): { attacked: T[]; clean: T[] } {
  return {
    attacked: scenarios.filter((s) => s.attacks.length > 0),
    clean: scenarios.filter((s) => s.attacks.length === 0),
  };
}

/**
 * A scenario file cut at its top-level `attacks:` line, so the preview can render the planted
 * Attack as its own marked block rather than more of the same YAML. Trailing blank lines before
 * the cut stay with `before`, minus one so the block sits flush. `attacks` is null when the file
 * has no such key.
 */
export function splitAttackBlock(yamlText: string): { before: string; attacks: string | null } {
  const lines = yamlText.split("\n");
  const at = lines.findIndex((l) => /^attacks:(\s|$)/.test(l));
  if (at === -1) return { before: yamlText, attacks: null };
  let end = at;
  while (end > 0 && lines[end - 1].trim() === "") end -= 1;
  return { before: lines.slice(0, end).join("\n") + "\n", attacks: lines.slice(at).join("\n") };
}
