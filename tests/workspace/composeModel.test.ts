import { describe, expect, it } from "vitest";
import type { PackPick, ProviderInfo, Source } from "@/ui/worlds/newWorld/sources";
import { canContinue, composedEntities, composedTools, ddlTables, domainOf, stepLabels, toolLines, worldDraftFromComposition } from "@/workspace/wizard/composeModel";

const providers: ProviderInfo[] = [
  { id: "stripe", label: "Stripe", kind: "payments", hue: "#7a4fa3", tools: [{ name: "list_payment_intents", description: "" }, { name: "create_refund", description: "" }] },
  { id: "slack", label: "Slack", kind: "chat", hue: "#a83b6e", tools: [{ name: "post_message", description: "" }] },
];
const packs: PackPick[] = [{ id: "northwind", name: "Northwind", domain: "support-commerce", description: "", entities: 5, tools: 4 }];

describe("toolLines", () => {
  it("reads an MCP tools/list JSON payload, or falls back to one name per line or comma", () => {
    expect(toolLines('{"tools":[{"name":"a"},{"name":"b"}]}', "mcp")).toEqual(["a", "b"]);
    expect(toolLines("orders.read\nrefunds.create, email.read\n\n", "mcp")).toEqual(["orders.read", "refunds.create", "email.read"]);
    expect(toolLines("export function getOrder() {}\nexport async function refund(x) {}", "ts")).toEqual(["getOrder", "refund"]);
  });
});

describe("composedTools / composedEntities / domainOf", () => {
  const sources: Source[] = [
    { kind: "mcp", provider: "stripe" },
    { kind: "tools", format: "mcp", text: "orders.read\ncreate_refund" },
    { kind: "db", ddl: "CREATE TABLE orders (id int);\ncreate table if not exists refund_requests (id int);" },
  ];
  it("unions provider catalogs with pasted tools, de-duplicated", () => {
    expect(composedTools(sources, providers)).toEqual(["list_payment_intents", "create_refund", "orders.read"]);
  });
  it("derives entities from DDL table names", () => {
    expect(ddlTables(sources[2].kind === "db" ? sources[2].ddl : "")).toEqual(["orders", "refund_requests"]);
    expect(composedEntities(sources)).toEqual(["Orders", "RefundRequests"]);
  });
  it("names the domain after the first provider, else the copied pack, else 'composed'", () => {
    expect(domainOf(sources, providers, packs)).toBe("payments");
    expect(domainOf([{ kind: "pack", packId: "northwind" }], providers, packs)).toBe("support-commerce");
    expect(domainOf([], providers, packs)).toBe("composed");
  });
});

describe("worldDraftFromComposition", () => {
  it("sizes the draft from what the sources contribute", () => {
    const d = worldDraftFromComposition("Ridgeway Payments", "desc", [{ kind: "mcp", provider: "stripe" }, { kind: "db", ddl: "create table a(x int); create table b(x int);" }], providers, packs);
    expect(d).toMatchObject({ name: "Ridgeway Payments", domain: "payments", description: "desc", tools: 2 });
    expect(d.scenarios).toBeGreaterThanOrEqual(2);
    expect(d.rows).toBe(12 + 2 * 4 + 2 * 8);
  });
});

describe("canContinue", () => {
  it("gates each step on what it needs", () => {
    expect(canContinue(0, null, { name: "", sources: [], packId: null })).toBe(false);
    expect(canContinue(0, "compose", { name: "", sources: [], packId: null })).toBe(true);
    expect(canContinue(1, "compose", { name: "", sources: [{ kind: "mcp", provider: "stripe" }], packId: null })).toBe(false);
    expect(canContinue(1, "compose", { name: "X", sources: [], packId: null })).toBe(false);
    expect(canContinue(1, "compose", { name: "X", sources: [{ kind: "mcp", provider: "stripe" }], packId: null })).toBe(true);
    expect(canContinue(1, "attach", { name: "", sources: [], packId: "northwind" })).toBe(true);
    // The plugin creates the World itself; nothing comes back through the wizard to review.
    expect(canContinue(1, "plugin", { name: "", sources: [], packId: null })).toBe(false);
    expect(stepLabels("plugin")).toEqual(["How", "Generate"]);
    expect(stepLabels("compose")).toEqual(["How", "Compose", "Review"]);
  });
});
