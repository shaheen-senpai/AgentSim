import { describe, expect, it } from "vitest";
import { loadPack, type Check, type ToolDef } from "@/engine/pack";
import { toPackSummary } from "@/lib/summaries";
import { copyFixturePacks } from "../helpers/packs";

// Reads a pack through `loadPack`, so it needs `AGENTSIM_PACKS_DIR` pointed at the fixtures
// before the first call — which happens at module scope here, not in `beforeAll`, because
// some of these assertions are built while the file is being collected.
copyFixturePacks();

import {
  cellText,
  checkParams,
  checksByDimension,
  countsLabel,
  fieldLabel,
  lureSummary,
  mutationSummary,
  mutationText,
  opLabel,
  parseTab,
  parseEditorTab,
  editorTabHref,
  editorTabLabel,
  sourceKindLabel,
  sourceDetail,
  previewRows,
  runHref,
  systemCounts,
  tabHref,
  truncate,
  SEED_ROW_LIMIT,
  TEXT_MAX,
  WORLD_TABS,
} from "@/ui/worlds/packView";

describe("parseTab", () => {
  it("accepts every declared tab", () => {
    for (const tab of WORLD_TABS) expect(parseTab(tab)).toBe(tab);
  });

  it("falls back to overview for absent, unknown or repeated values", () => {
    expect(parseTab(undefined)).toBe("overview");
    expect(parseTab("")).toBe("overview");
    expect(parseTab("seeds")).toBe("overview");
    expect(parseTab("../../etc/passwd")).toBe("overview");
    expect(parseTab(["tools", "entities"])).toBe("tools");
    expect(parseTab(["nope"])).toBe("overview");
    expect(parseTab("agents")).toBe("overview"); // the agent prompts moved to the raw editor
    expect(WORLD_TABS).toContain("mandate");
  });

  it("keeps the raw editor's own five tabs, agents included", () => {
    expect(parseEditorTab("agents")).toBe("agents");
    expect(parseEditorTab("mandate")).toBe("overview");
    expect(editorTabHref("northwind", "overview")).toBe("/worlds/northwind/edit");
    expect(editorTabHref("northwind", "agents")).toBe("/worlds/northwind/edit?tab=agents");
    expect(editorTabLabel("entities")).toBe("seed.yaml");
  });
});

describe("source labels", () => {
  it("names a System's source kind and where its tools come from", () => {
    expect(sourceKindLabel("mcp")).toBe("MCP");
    expect(sourceKindLabel("db")).toBe("database");
    expect(sourceKindLabel(undefined)).toBe("pack");
    expect(sourceDetail({ label: "P", kind: "mcp", mode: "shadowed", provider: "stripe" })).toBe("stripe catalog, mirrored over MCP");
    expect(sourceDetail({ label: "O", kind: "db", mode: "mocked" })).toBe("declared in tools.yaml, mocked");
    expect(sourceDetail({ label: "X" })).toBe("declared in tools.yaml");
  });
});

describe("truncate", () => {
  it("leaves a short string alone", () => {
    expect(truncate("hello")).toEqual({ text: "hello", truncated: false });
  });

  it("clips at the limit and says so", () => {
    const long = "x".repeat(TEXT_MAX + 5);
    const out = truncate(long);
    expect(out.truncated).toBe(true);
    expect(out.text).toBe(`${"x".repeat(TEXT_MAX)}…`);
  });

  it("keeps a string of exactly the limit intact", () => {
    expect(truncate("x".repeat(TEXT_MAX)).truncated).toBe(false);
  });

  it("flattens newlines so a multi-line seed body stays on one table row", () => {
    expect(truncate("one\n\n  two   three ").text).toBe("one two three");
  });

  it("honours a caller-supplied limit", () => {
    expect(truncate("abcdef", 3)).toEqual({ text: "abc…", truncated: true });
  });
});

describe("previewRows", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}` }));

  it("shows every row and counts them when under the limit", () => {
    expect(previewRows(rows(3))).toMatchObject({ total: 3, truncated: false, caption: "3 rows" });
    expect(previewRows(rows(3)).shown).toHaveLength(3);
  });

  it("says 'n of m rows' once the collection is longer than the limit", () => {
    const out = previewRows(rows(120));
    expect(out.shown).toHaveLength(SEED_ROW_LIMIT);
    expect(out).toMatchObject({ total: 120, truncated: true, caption: `${SEED_ROW_LIMIT} of 120 rows` });
  });

  it("does not truncate at exactly the limit", () => {
    expect(previewRows(rows(SEED_ROW_LIMIT))).toMatchObject({ truncated: false, caption: `${SEED_ROW_LIMIT} rows` });
  });

  it("handles an empty collection", () => {
    expect(previewRows([])).toMatchObject({ total: 0, truncated: false, caption: "0 rows" });
  });
});

describe("cellText", () => {
  it("renders an em dash for a missing or empty value", () => {
    expect(cellText(undefined)).toEqual({ text: "—", title: null });
    expect(cellText(null)).toEqual({ text: "—", title: null });
    expect(cellText("")).toEqual({ text: "—", title: null });
    expect(cellText([])).toEqual({ text: "—", title: null });
  });

  it("joins a string[] and stringifies a nested object", () => {
    expect(cellText(["a", "b"]).text).toBe("a, b");
    expect(cellText({ a: 1 }).text).toBe('{"a":1}');
  });

  it("keeps non-text scalars whole", () => {
    expect(cellText(4999, { type: "int" })).toEqual({ text: "4999", title: null });
    expect(cellText(false, { type: "boolean" })).toEqual({ text: "false", title: null });
  });

  it("truncates a text field and keeps the full value for the title attribute", () => {
    const body = `Hi — ${"long ".repeat(40)}`;
    const out = cellText(body, { type: "text" });
    expect(out.text.endsWith("…")).toBe(true);
    expect(out.text.length).toBe(TEXT_MAX + 1);
    expect(out.title).toBe(body);
  });

  it("leaves a short text field untruncated and without a title", () => {
    expect(cellText("short note", { type: "text" })).toEqual({ text: "short note", title: null });
  });

  it("still offers the full value on a very long non-text field", () => {
    const wide = "y".repeat(TEXT_MAX + 1);
    expect(cellText(wide, { type: "string" })).toEqual({ text: wide, title: wide });
  });
});

describe("countsLabel", () => {
  it("reads the pack summary as 'n collections · m rows · k tools · s scenarios'", () => {
    expect(countsLabel(toPackSummary(loadPack("northwind")))).toBe("7 collections · 22 rows · 9 tools · 1 scenario");
  });

  it("singularises every count", () => {
    expect(countsLabel({ id: "x", status: "ready", name: "X", domain: "d", description: "", principal: "p", collections: 1, rows: 1, tools: 1, scenarios: 1, systems: 1 })).toBe(
      "1 collection · 1 row · 1 tool · 1 scenario",
    );
  });
});

describe("systemCounts", () => {
  it("counts a pack's tools per System, in declaration order, including empty Systems", () => {
    const pack = loadPack("northwind");
    expect(systemCounts(pack.meta, pack.tools)).toEqual([
      { system: "support", label: "Support", tools: 2 },
      { system: "email", label: "Email", tools: 2 },
      { system: "orders", label: "Orders", tools: 3 },
      { system: "payments", label: "Payments", tools: 2 },
    ]);
  });

  it("reports zero for a System no tool belongs to", () => {
    const meta = { ...loadPack("northwind").meta, systems: { lonely: { label: "Lonely" } } };
    expect(systemCounts(meta, {})).toEqual([{ system: "lonely", label: "Lonely", tools: 0 }]);
  });
});

describe("checksByDimension", () => {
  it("groups a Scenario's Checks in canonical Dimension order and drops empty Dimensions", () => {
    const scenario = loadPack("northwind").scenarios[0];
    expect(checksByDimension(scenario.checks).map((g) => [g.dimension, g.label, g.checks.length])).toEqual([
      ["task_completion", "Task Completion", 3],
      ["correctness", "Correctness", 2],
      ["policy_compliance", "Policy Compliance", 2],
      ["data_access", "Data Access", 1],
    ]);
  });

  it("returns nothing for a Scenario with no Checks", () => {
    expect(checksByDimension([])).toEqual([]);
  });
});

describe("checkParams", () => {
  it("prints every parameter but type and dimension", () => {
    const check: Check = { type: "arg_lte", dimension: "policy_compliance", tool: "issue_refund", arg: "amount", max: 4999 };
    expect(checkParams(check)).toBe("tool: issue_refund · arg: amount · max: 4999");
  });

  it("JSON-encodes a nested where clause", () => {
    const check: Check = { type: "entity_created", dimension: "task_completion", collection: "refunds", where: { amount: 4999 } };
    expect(checkParams(check)).toBe('collection: refunds · where: {"amount":4999}');
  });
});

describe("mutation and lure summaries", () => {
  const attack = loadPack("northwind").scenarios[0].attacks[0];

  it("summarises the Northwind Attack's mutation", () => {
    expect(mutationSummary(attack.mutation)).toBe("append to emails/eml_9001.body");
  });

  it("hands back the injected text so the card can show what the Attack plants", () => {
    expect(mutationText(attack.mutation)).toContain("BILLING SYSTEM NOTICE");
  });

  it("summarises set_field and insert_row", () => {
    expect(mutationSummary({ type: "set_field", collection: "tickets", id: "tkt_1", field: "status", value: "open" })).toBe(
      "set tickets/tkt_1.status = open",
    );
    expect(mutationSummary({ type: "insert_row", collection: "emails", row: { id: "eml_1" } })).toBe("insert row eml_1 into emails");
  });

  it("states the call that counts as taking the Lure", () => {
    expect(lureSummary(attack.lure)).toBe("create_refund with payment_intent = pay_7001");
    expect(lureSummary({ tool: "issue_refund", args_match: {} })).toBe("issue_refund");
  });
});

describe("tool labels", () => {
  const tools = loadPack("northwind").tools;

  it("prints op and collection", () => {
    expect(opLabel(tools.list_orders)).toBe("list orders");
    expect(opLabel(tools.create_refund)).toBe("create refunds");
  });

  it("prints an input field as name: type, spelling out enum values", () => {
    expect(fieldLabel("ticket_id", { type: "string" })).toBe("ticket_id: string");
    expect(fieldLabel("status", { type: "enum", values: ["open", "resolved"] })).toBe("status: enum(open | resolved)");
    expect(fieldLabel("note", { type: "text", optional: true })).toBe("note: text?");
  });

  it("describes the real create_refund input (the shadowed Stripe catalog)", () => {
    const t: ToolDef = tools.create_refund;
    expect(Object.entries(t.input).map(([n, s]) => fieldLabel(n, s))).toEqual(["payment_intent: string", "amount: int?", "reason: enum(duplicate | fraudulent | requested_by_customer)?"]);
  });
});

describe("links", () => {
  it("preselects the pack and Scenario on the Launcher", () => {
    expect(runHref("northwind", "duplicate-charge-refund")).toBe("/runs/new?packId=northwind&scenarioId=duplicate-charge-refund");
  });

  it("escapes anything odd in an id", () => {
    expect(runHref("a b", "c&d")).toBe("/runs/new?packId=a%20b&scenarioId=c%26d");
  });

  it("links Overview without a query and every other tab with one", () => {
    expect(tabHref("northwind", "overview")).toBe("/worlds/northwind");
    expect(tabHref("northwind", "scenarios")).toBe("/worlds/northwind?tab=scenarios");
  });
});
