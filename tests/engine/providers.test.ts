import { describe, expect, it, vi } from "vitest";
import { resolveShadowedTools, ProviderError, type PackMeta, type ToolDef } from "@/engine/pack";

function tool(system: string): ToolDef {
  return {
    name: "x", system, kind: "read", description: "d", input: {},
    subject: { collection: "c", id: "${input.id}" }, op: "get", collection: "c",
  };
}

describe("resolveShadowedTools", () => {
  it("merges a shadowed provider's tools, tagged with the system key", () => {
    const systems: PackMeta["systems"] = { stripe: { label: "Stripe", mode: "shadowed", provider: "stripe" } };
    const fake = vi.fn().mockReturnValue({ create_refund: tool("stripe") });
    const merged = resolveShadowedTools(systems, new Set(), fake);
    expect(fake).toHaveBeenCalledWith("stripe");
    expect(merged.create_refund.system).toBe("stripe");
  });

  it("ignores non-shadowed systems", () => {
    const systems: PackMeta["systems"] = { orders: { label: "Orders", mode: "mocked" } };
    const fake = vi.fn();
    expect(resolveShadowedTools(systems, new Set(), fake)).toEqual({});
    expect(fake).not.toHaveBeenCalled();
  });

  it("throws on a name collision with an existing pack tool", () => {
    const systems: PackMeta["systems"] = { stripe: { label: "Stripe", mode: "shadowed", provider: "stripe" } };
    const fake = vi.fn().mockReturnValue({ get_ticket: tool("stripe") });
    expect(() => resolveShadowedTools(systems, new Set(["get_ticket"]), fake)).toThrow(ProviderError);
  });

  it("throws on a name collision between two shadowed sources", () => {
    const systems: PackMeta["systems"] = {
      a: { label: "A", mode: "shadowed", provider: "a" },
      b: { label: "B", mode: "shadowed", provider: "b" },
    };
    const fake = vi.fn().mockImplementation((id: string) => ({ same_name: tool(id) }));
    expect(() => resolveShadowedTools(systems, new Set(), fake)).toThrow(ProviderError);
  });

  it("throws a clear error when mode is shadowed but provider is missing", () => {
    const systems: PackMeta["systems"] = { stripe: { label: "Stripe", mode: "shadowed" } };
    expect(() => resolveShadowedTools(systems, new Set(), vi.fn())).toThrow(ProviderError);
  });
});

describe("loadProviderTools", () => {
  it("throws ProviderError for an unknown provider id", async () => {
    const { loadProviderTools } = await import("@/engine/pack");
    expect(() => loadProviderTools("not-a-real-provider")).toThrow(ProviderError);
  });
});
