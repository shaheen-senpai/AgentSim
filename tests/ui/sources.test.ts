import { describe, expect, it } from "vitest";
import { isCopyOnly, slugify, srcLabel, srcMode, srcToolCount, toGenerateInput, type PackPick, type ProviderInfo } from "@/ui/worlds/newWorld/sources";

const providers: ProviderInfo[] = [{ id: "stripe", label: "Stripe", kind: "payments", hue: "#7a4fa3", tools: [{ name: "create_refund", description: "Refund." }] }];
const packs: PackPick[] = [{ id: "p1", name: "Pack One", domain: "d", description: "x", entities: 3, tools: 4 }];

describe("sources", () => {
  it("labels, modes and counts every source kind", () => {
    expect(srcLabel({ kind: "mcp", provider: "stripe" }, providers, packs)).toBe("Stripe");
    expect(srcLabel({ kind: "tools", format: "openapi", text: "" }, providers, packs)).toBe("Your tools (OpenAPI)");
    expect(srcLabel({ kind: "db", ddl: "" }, providers, packs)).toBe("Pasted schema");
    expect(srcLabel({ kind: "pack", packId: "p1" }, providers, packs)).toBe("Pack One");
    expect(srcMode({ kind: "mcp", provider: "stripe" })).toBe("shadowed");
    expect(srcMode({ kind: "pack", packId: "p1" })).toBe("copied");
    expect(srcToolCount({ kind: "mcp", provider: "stripe" }, providers, packs)).toBe(1);
    expect(srcToolCount({ kind: "pack", packId: "p1" }, providers, packs)).toBe(4);
    expect(srcToolCount({ kind: "db", ddl: "" }, providers, packs)).toBeNull();
  });

  it("detects a copy-only composition and slugifies names", () => {
    expect(isCopyOnly([{ kind: "pack", packId: "p1" }])).toBe("p1");
    expect(isCopyOnly([{ kind: "pack", packId: "p1" }, { kind: "db", ddl: "x" }])).toBeNull();
    expect(isCopyOnly([])).toBeNull();
    expect(slugify("Zendesk + orders-svc Desk")).toBe("zendesk-orders-svc-desk");
    expect(slugify("!!")).toBe("");
    expect(slugify("x")).toBe("");
    expect(slugify("A".repeat(60)).length).toBeLessThanOrEqual(41);
  });

  it("folds sources into the generator's input", () => {
    const out = toGenerateInput(
      [{ kind: "mcp", provider: "stripe" }, { kind: "tools", format: "openapi", text: "paths: {}" }, { kind: "db", ddl: "create table x();" }],
      { name: "N", domain: "d", principal: "Customer", description: "Desc." },
      providers,
    );
    expect(out.name).toBe("N");
    expect(out.domain).toBe("d");
    expect(out.schema).toBe("create table x();");
    expect(out.openapi).toBe("paths: {}");
    expect(out.tools).toBe("- create_refund: Refund.");
    expect(out.description).toBe("Desc.\n\nPrincipal: Customer.\nSources: Stripe (shadowed over MCP); your own tools (OpenAPI); a pasted database schema.");
  });

  it("keeps pasted MCP/TypeScript tool text alongside the provider catalogs", () => {
    const out = toGenerateInput([{ kind: "tools", format: "ts", text: "export const tools = []" }], { name: "N", domain: "d", principal: "", description: "D" }, providers);
    expect(out.tools).toBe("export const tools = []");
    expect(out.schema).toBeUndefined();
    expect(out.openapi).toBeUndefined();
    expect(out.description).toBe("D\n\nSources: your own tools (TypeScript).");
  });
});
