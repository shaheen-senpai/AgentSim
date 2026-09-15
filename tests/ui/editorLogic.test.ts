import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack, PACK_ID_RE, parsePackFiles } from "@/engine/pack";
import {
  errorLine,
  fileTab,
  filesEqual,
  groupErrorsByFile,
  isValidScenarioId,
  isValidWorldId,
  packField,
  scenarioFileKey,
  scenarioSkeleton,
  tabFileKey,
  tabsWithErrors,
  withPackId,
  WORLD_ID_RE,
} from "@/ui/worlds/editorLogic";

describe("isValidScenarioId", () => {
  it("accepts lowercase letters, digits and hyphens starting with a letter or digit", () => {
    expect(isValidScenarioId("refund-flow")).toBe(true);
    expect(isValidScenarioId("a")).toBe(true);
    expect(isValidScenarioId("9-lives")).toBe(true);
  });

  it("rejects spaces, capitals, punctuation and a leading hyphen", () => {
    expect(isValidScenarioId("Bad Id!")).toBe(false);
    expect(isValidScenarioId("Bad-Id")).toBe(false);
    expect(isValidScenarioId("-leading")).toBe(false);
    expect(isValidScenarioId("")).toBe(false);
    expect(isValidScenarioId("has_underscore")).toBe(false);
    expect(isValidScenarioId("has/slash")).toBe(false);
  });
});

describe("scenarioFileKey", () => {
  it("matches the server's PACK_FILE_RE scenarios segment", () => {
    expect(scenarioFileKey("refund-flow")).toBe("scenarios/refund-flow.yaml");
  });
});

describe("scenarioSkeleton", () => {
  it("is a minimal valid scenario against a real pack: id, title, task_brief, policy.text, one check, no attacks", () => {
    const pack = loadPack("northwind");
    const yaml = scenarioSkeleton({ id: "brand-new-flow", principal: pack.meta.principal });

    expect(yaml).toContain("id: brand-new-flow");
    expect(yaml).toContain("title:");
    expect(yaml).toContain("task_brief:");
    expect(yaml).toContain("policy:");
    expect(yaml).toContain("text:");
    expect(yaml).toContain("attacks: []");

    const files = { ...pack.files, [scenarioFileKey("brand-new-flow")]: yaml };
    const { pack: parsed, errors } = parsePackFiles(files);
    expect(errors).toEqual([]);
    expect(parsed).not.toBeNull();
    const added = parsed?.scenarios.find((s) => s.id === "brand-new-flow");
    expect(added).toBeDefined();
    expect(added?.checks).toHaveLength(1);
    expect(added?.attacks).toHaveLength(0);
  });

  it("validates regardless of which collection is named principal", () => {
    const pack = loadPack("northwind");
    // `reads_scoped` is never cross-referenced against real collections (src/engine/pack.ts), so an
    // arbitrary principal string must still produce a valid scenario.
    const yaml = scenarioSkeleton({ id: "another-flow", principal: "not-a-real-collection" });
    const files = { ...pack.files, [scenarioFileKey("another-flow")]: yaml };
    const { errors } = parsePackFiles(files);
    expect(errors).toEqual([]);
  });
});

describe("tabFileKey / fileTab", () => {
  it("round-trips the three single-file tabs", () => {
    expect(tabFileKey("overview")).toBe("pack.yaml");
    expect(tabFileKey("seed")).toBe("seed.yaml");
    expect(tabFileKey("tools")).toBe("tools.yaml");
    expect(fileTab("pack.yaml")).toBe("overview");
    expect(fileTab("seed.yaml")).toBe("seed");
    expect(fileTab("tools.yaml")).toBe("tools");
  });

  it("has no single file key for the multi-file tabs", () => {
    expect(tabFileKey("scenarios")).toBeNull();
    expect(tabFileKey("agents")).toBeNull();
  });

  it("maps every scenario/agent file to its tab", () => {
    expect(fileTab("scenarios/refund-flow.yaml")).toBe("scenarios");
    expect(fileTab("agents/naive.md")).toBe("agents");
  });

  it("returns null for a file outside the pack layout", () => {
    expect(fileTab("README.md")).toBeNull();
    expect(fileTab("")).toBeNull();
  });
});

describe("groupErrorsByFile", () => {
  it("groups by file, preserving first-seen file order", () => {
    const errors = [
      { file: "seed.yaml", path: "rows.customers[0].email", message: "bad" },
      { file: "pack.yaml", path: "principal", message: "unknown" },
      { file: "seed.yaml", path: "rows.orders[1].total", message: "bad too" },
    ];
    const grouped = groupErrorsByFile(errors);
    expect(Object.keys(grouped)).toEqual(["seed.yaml", "pack.yaml"]);
    expect(grouped["seed.yaml"]).toHaveLength(2);
    expect(grouped["pack.yaml"]).toHaveLength(1);
  });

  it("returns an empty object for no errors", () => {
    expect(groupErrorsByFile([])).toEqual({});
  });
});

describe("tabsWithErrors", () => {
  it("collects every distinct tab that owns an erroring file", () => {
    const errors = [
      { file: "seed.yaml", path: "", message: "x" },
      { file: "scenarios/a.yaml", path: "", message: "x" },
      { file: "scenarios/b.yaml", path: "", message: "x" },
    ];
    const tabs = tabsWithErrors(errors);
    expect(tabs.has("seed")).toBe(true);
    expect(tabs.has("scenarios")).toBe(true);
    expect(tabs.size).toBe(2);
  });

  it("is empty for no errors", () => {
    expect(tabsWithErrors([]).size).toBe(0);
  });
});

describe("errorLine", () => {
  it("extracts the line number from a YAML parse error's message", () => {
    expect(errorLine("Nested mappings are not allowed in compact mappings at line 3, column 5:")).toBe(3);
    expect(errorLine("Implicit map keys need to be followed by map values at line 12, column 1:")).toBe(12);
  });

  it("returns null for a semantic error with no line number", () => {
    expect(errorLine("row cus_1 in customers is missing required field 'email'")).toBeNull();
  });
});

describe("filesEqual", () => {
  it("is true for identical maps regardless of key order", () => {
    expect(filesEqual({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
  });

  it("is false when a value differs", () => {
    expect(filesEqual({ a: "1" }, { a: "2" })).toBe(false);
  });

  it("is false when a key is added or removed", () => {
    expect(filesEqual({ a: "1" }, { a: "1", b: "2" })).toBe(false);
    expect(filesEqual({ a: "1", b: "2" }, { a: "1" })).toBe(false);
  });

  it("is true for two empty maps", () => {
    expect(filesEqual({}, {})).toBe(true);
  });
});

describe("WORLD_ID_RE", () => {
  it("is character-for-character the server's PACK_ID_RE", () => {
    expect(WORLD_ID_RE.source).toBe(PACK_ID_RE.source);
    expect(WORLD_ID_RE.flags).toBe(PACK_ID_RE.flags);
  });

  it("accepts a two-to-forty-one character lowercase id and rejects everything else", () => {
    expect(isValidWorldId("halvard-helpdesk")).toBe(true);
    expect(isValidWorldId("w1")).toBe(true);
    expect(isValidWorldId("w")).toBe(false); // one character is too short for the server too
    expect(isValidWorldId("-leading")).toBe(false);
    expect(isValidWorldId("Capitals")).toBe(false);
    expect(isValidWorldId("has space")).toBe(false);
    expect(isValidWorldId("a".repeat(42))).toBe(false);
  });
});

describe("packField", () => {
  it("reads a top-level scalar out of a real pack.yaml without a YAML parser", () => {
    const packYaml = loadPack("northwind").files["pack.yaml"];
    expect(packField(packYaml, "id")).toBe("northwind");
    expect(packField(packYaml, "principal")).toBe("customers"); // trailing comment and all
    expect(packField(packYaml, "nothing")).toBeNull();
  });
});

describe("withPackId", () => {
  it("rewrites the declared id so a copied template becomes its own World", () => {
    const packYaml = loadPack("northwind").files["pack.yaml"];
    const renamed = withPackId(packYaml, "southwind");
    expect(packField(renamed, "id")).toBe("southwind");
    expect(renamed).toContain("name: Northwind Outfitters"); // nothing else moved
    expect(parsePackFiles({ ...loadPack("northwind").files, "pack.yaml": renamed }).errors).toEqual([]);
  });

  it("adds an id to a pack.yaml that declares none", () => {
    expect(withPackId("name: X\n", "new-world")).toBe("id: new-world\nname: X\n");
  });
});

// ─────────────────────────────── import purity (browser-safety) ───────────────────────────────

/**
 * `editorLogic.ts` is loaded straight into the client bundle by `PackEditor.tsx` (a `"use client"`
 * component). `@/engine/pack` value-imports `node:fs`/`node:path`, so this file may only reach its
 * types (`import type`, erased at compile time) — never a value. Same pattern as
 * `tests/ui/buildFlow.test.ts`'s import-purity check for `src/ui/flow/`.
 */
describe("editorLogic: import purity (browser-safety)", () => {
  it("never value-imports @/engine/pack or a node: builtin", () => {
    const text = readFileSync("src/ui/worlds/editorLogic.ts", "utf8");
    const importLines = text.split("\n").filter((line) => /^\s*import\b/.test(line) || /^\s*export\b.*\bfrom\b/.test(line));
    const forbidden: [RegExp, string][] = [
      [/@\/engine\/pack\b/, "@/engine/pack (touches node:fs/node:path)"],
      [/["']node:/, "a node: builtin"],
    ];
    for (const line of importLines) {
      if (/^\s*(import|export)\s+type\b/.test(line)) continue; // erased at compile time — always safe
      for (const [pattern, why] of forbidden) {
        expect(line, `forbidden value import (${why}) — "${line.trim()}"`).not.toMatch(pattern);
      }
    }
  });
});
