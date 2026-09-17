import { describe, expect, it } from "vitest";
import { IMPORT_POOL, buildHandshake, nextImportCandidate } from "@/workspace/handshake";

describe("nextImportCandidate", () => {
  it("offers Vendor Onboarding first, then skips names already in the workspace", () => {
    expect(nextImportCandidate([]).name).toBe("Vendor Onboarding");
    expect(nextImportCandidate(["Vendor Onboarding"]).name).toBe(IMPORT_POOL[1].name);
  });
  it("wraps around once every candidate exists, so the demo never dead-ends", () => {
    expect(nextImportCandidate(IMPORT_POOL.map((c) => c.name)).name).toBe(IMPORT_POOL[0].name);
  });
});

describe("buildHandshake", () => {
  it("produces an ordered script that ends with the import step and monotonic timings", () => {
    const steps = buildHandshake(IMPORT_POOL[0]);
    expect(steps[0].text).toMatch(/handshake mcp\.agentsim\.dev/);
    expect(steps.at(-1)?.text).toMatch(/imported/i);
    for (let i = 1; i < steps.length; i++) expect(steps[i].at).toBeGreaterThan(steps[i - 1].at);
    expect(steps.some((s) => s.text.includes("5 tools"))).toBe(true);
    expect(steps.some((s) => s.text.includes("Vendor, Document, BankAccount, Invoice"))).toBe(true);
  });
});
