// Pure logic for the World pack editor (Task 17): everything `PackEditor.tsx` and `YamlEditor.tsx`
// need that has no business touching React or the DOM, so it is unit-tested the same way
// `entityLayout.ts` / `packView.ts` are (`tests/ui/editorLogic.test.ts`).
//
// Deliberately imports only `import type { ValidationError } from "@/engine/pack"` (erased at
// compile time — see the import-purity test below) and `import type { WorldTab } from "./packView"`
// (packView itself is browser-safe). Nothing here value-imports `@/engine/pack`, which reaches
// `node:fs`/`node:path` — this module is loaded straight into the client bundle by `PackEditor.tsx`.
import type { ValidationError } from "@/engine/pack";
import type { WorldTab } from "./packView";

// ───────────────────────────── new-scenario id ─────────────────────────────

/** Same rule the server enforces via `PACK_FILE_RE`'s `scenarios/<id>.yaml` segment. */
export const SCENARIO_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function isValidScenarioId(id: string): boolean {
  return SCENARIO_ID_RE.test(id);
}

/** The pack-file key a scenario id lives at. */
export function scenarioFileKey(id: string): string {
  return `scenarios/${id}.yaml`;
}

/**
 * A minimal, genuinely valid scenario: id/title/task_brief/policy.text and exactly one Check, no
 * Attacks. The Check is `reads_scoped` with the pack's own principal — the only Check type
 * `validateScenario` (src/engine/pack.ts) does not cross-reference against seed rows or tools, so
 * this skeleton validates against *any* pack without knowing its collections or tools.
 */
export function scenarioSkeleton(input: { id: string; principal: string }): string {
  const { id, principal } = input;
  return [
    `id: ${id}`,
    `title: New scenario`,
    `task_brief: |`,
    `  Describe what the agent should accomplish.`,
    `policy:`,
    `  text: |`,
    `    Describe the policy the agent must follow.`,
    `checks:`,
    `  - type: reads_scoped`,
    `    dimension: data_access`,
    `    principal: ${principal}`,
    `attacks: []`,
    ``,
  ].join("\n");
}

// ───────────────────────────── new-world id (Task 18) ─────────────────────────────

/**
 * The id a new World may take. Mirrors `PACK_ID_RE` in `src/engine/pack.ts`, which cannot be
 * value-imported here (it reaches `node:fs`); `tests/ui/editorLogic.test.ts` asserts the two
 * sources are character-for-character identical, so they cannot drift.
 */
export const WORLD_ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;

export function isValidWorldId(id: string): boolean {
  return WORLD_ID_RE.test(id);
}

/** A top-level scalar of `pack.yaml` (`id`, `principal`), read without a YAML parser. */
export function packField(packYaml: string, field: string): string | null {
  const m = new RegExp(`^${field}:[ \\t]*["']?([A-Za-z0-9_.-]+)["']?[ \\t]*(?:#.*)?$`, "m").exec(packYaml);
  return m ? m[1] : null;
}

/**
 * `pack.yaml` with its `id:` set to `id` — what makes copying a template a new World rather than a
 * second copy of the old one. The directory name is the id every URL uses, and the API refuses a
 * `pack.yaml` that disagrees with it (`packWriteErrors`), so this runs on every create.
 */
export function withPackId(packYaml: string, id: string): string {
  const line = `id: ${id}`;
  return /^id:.*$/m.test(packYaml) ? packYaml.replace(/^id:.*$/m, line) : `${line}\n${packYaml}`;
}

// ───────────────────────────── tabs ↔ files ─────────────────────────────

/** The single-file tabs' file key — `null` for `scenarios`/`agents`, which hold many files. */
export function tabFileKey(tab: WorldTab): string | null {
  switch (tab) {
    case "overview":
      return "pack.yaml";
    case "seed":
      return "seed.yaml";
    case "tools":
      return "tools.yaml";
    default:
      return null;
  }
}

/** The tab a pack-file key belongs to, or `null` for a key outside the pack layout. */
export function fileTab(file: string): WorldTab | null {
  if (file === "pack.yaml") return "overview";
  if (file === "seed.yaml") return "seed";
  if (file === "tools.yaml") return "tools";
  if (file.startsWith("scenarios/")) return "scenarios";
  if (file.startsWith("agents/")) return "agents";
  return null;
}

// ───────────────────────────── validation errors ─────────────────────────────

/** `ValidationError[]` grouped by `file`, preserving first-seen file order. */
export function groupErrorsByFile(errors: ValidationError[]): Record<string, ValidationError[]> {
  const out: Record<string, ValidationError[]> = {};
  for (const e of errors) {
    (out[e.file] ??= []).push(e);
  }
  return out;
}

/** Every tab that owns at least one erroring file. */
export function tabsWithErrors(errors: ValidationError[]): Set<WorldTab> {
  const tabs = new Set<WorldTab>();
  for (const e of errors) {
    const t = fileTab(e.file);
    if (t) tabs.add(t);
  }
  return tabs;
}

/**
 * The 1-based line number a YAML parse error's message names ("... at line 3, column 5:"), or
 * `null` when the message doesn't carry one — true of every semantic (Zod) validation error, which
 * only carries a `path`. `YamlEditor` uses this to mark the gutter; it never invents a line number.
 */
export function errorLine(message: string): number | null {
  const m = message.match(/\bline (\d+)/);
  return m ? Number(m[1]) : null;
}

// ───────────────────────────── files map ─────────────────────────────

/** Shallow value-equality for a pack's `files` map — the editor's dirty check. */
export function filesEqual(a: Record<string, string>, b: Record<string, string>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  if (ak.length !== bk.length) return false;
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && a[k] === b[k]);
}
