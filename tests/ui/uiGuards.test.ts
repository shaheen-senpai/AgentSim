// Two static guards over everything under src/ui (moved here from the retired buildFlow test).
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Every `.ts`/`.tsx` file under `dir`, recursively, as repo-relative paths. */
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const UI_FILES = sourceFiles("src/ui");

/**
 * Every module specifier `text` imports or re-exports **by value**, with `import type` /
 * `export type` skipped (erased at compile time, so always safe). Specifier-based, not line-based,
 * so a wrapped multi-line import cannot slip past.
 */
function valueImportSpecifiers(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/^[ \t]*(import|export)\b([^;]*?)\bfrom\s*["']([^"']+)["']/gm)) {
    if (/^\s*type\b/.test(m[2])) continue;
    out.push(m[3]);
  }
  for (const m of text.matchAll(/^[ \t]*import\s+["']([^"']+)["']/gm)) out.push(m[1]); // side-effect import
  return out;
}

/**
 * Nothing reachable from a `"use client"` component may value-import server-only code.
 * `@/engine/pack` value-imports `node:fs`/`node:path` and `@/engine/attack` reaches it transitively;
 * `@/runner/store` and `@/runner/agentRegistry` are server-only outright; `@/lib/entityViews` and
 * `@/lib/providers` read the filesystem. The safe leaf for `matchesLure`/`injectedText` is
 * `@/engine/lure`, which must itself never value-import any of those. A text check, deliberately:
 * it fails loudly the moment a future edit adds a forbidden runtime import.
 */
describe("src/ui: import purity (browser-safety)", () => {
  const FORBIDDEN: [RegExp, string][] = [
    [/^@\/engine\/pack$/, "@/engine/pack (touches node:fs/node:path)"],
    [/^@\/engine\/attack$/, "@/engine/attack (transitively touches @/engine/pack)"],
    [/^@\/engine\/world$/, "@/engine/world (seeds from a pack)"],
    [/^@\/runner\/store$/, "@/runner/store (server-only)"],
    [/^@\/runner\/agentRegistry$/, "@/runner/agentRegistry (server-only: reads agents.json)"],
    [/^@\/lib\/(entityViews|providers|draftSummary|runPack|summaries)$/, "a server-only @/lib module"],
    [/^node:/, "a node: builtin"],
  ];
  const files = [...UI_FILES, "src/engine/lure.ts"];

  it("covers every file under src/ui, plus the leaf module they share", () => {
    expect(UI_FILES.length).toBeGreaterThan(30);
    expect(files).toContain("src/ui/waves.ts");
    expect(files).toContain("src/ui/run/injected.ts");
    expect(files).toContain("src/engine/lure.ts");
  });

  it("never value-imports server-only code or a node: builtin", () => {
    for (const file of files) {
      for (const spec of valueImportSpecifiers(readFileSync(file, "utf8"))) {
        for (const [pattern, why] of FORBIDDEN) {
          expect(spec, `${file}: forbidden value import (${why}) — "${spec}"`).not.toMatch(pattern);
        }
      }
    }
  });

  it("catches a forbidden specifier that a line-based filter would miss", () => {
    expect(valueImportSpecifiers('import {\n  loadPack,\n} from "@/engine/pack";\n')).toEqual(["@/engine/pack"]);
    expect(valueImportSpecifiers('import type {\n  ToolDef,\n} from "@/engine/pack";\n')).toEqual([]);
    expect(valueImportSpecifiers('export { injectedText } from "@/engine/lure";\n')).toEqual(["@/engine/lure"]);
    expect(valueImportSpecifiers('export type { Check } from "@/engine/pack";\n')).toEqual([]);
    expect(valueImportSpecifiers('import "./globals.css";\n')).toEqual(["./globals.css"]);
  });
});

/**
 * "The same engine, Evaluator and UI run both packs; nothing about either domain is compiled in"
 * (README). Comment-only lines are skipped — the docs under src/ui name Northwind's entities on
 * purpose, to explain what a pack-worded string replaced. Rendered copy and identifiers may not.
 */
describe("src/ui: domain neutrality (no Northwind vocabulary)", () => {
  const BANNED = /\b(northwind|customers?|payments?|refunds?)\b/i;
  const isCommentLine = (line: string) => /^\s*(\/\/|\/\*|\*)/.test(line);

  it("names no Northwind entity in any string, identifier or JSX text under src/ui", () => {
    for (const file of UI_FILES) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (isCommentLine(line)) return;
        expect(BANNED.test(line), `${file}:${i + 1} names a Northwind entity — "${line.trim()}"`).toBe(false);
      });
    }
  });

  it("would catch the string it was written for", () => {
    expect(BANNED.test("Source: the injected block in the customer&apos;s email")).toBe(true);
    expect(BANNED.test("Source: the injected block in the comment")).toBe(false);
  });
});
