import { describe, expect, it } from "vitest";
import { agentFromDraft, draftMandate } from "@/workspace/wizard/draftAgent";

const files = {
  "pack.yaml": [
    "id: x", "name: Vendor Desk", "domain: procurement", "description: d", "principal: vendors",
    "systems: {}",
    "entities:", "  vendors: { label: Vendor, id_prefix: ven_, owner: self, fields: { id: string } }", "  invoices: { label: Invoice, id_prefix: inv_, owner: { via: vendor_id }, fields: { id: string, vendor_id: string } }",
    "mandates:", "  m1: { title: KYC first, text: Create vendors only after KYC passes. }", "  m2: { text: Never edit bank details. }",
  ].join("\n"),
  "tools.yaml": ["vendors.create:", "  system: erp", "  kind: write", "  description: Create a vendor", "documents.read:", "  system: erp", "  kind: read", "  description: Read a document"].join("\n"),
};

describe("draftMandate", () => {
  it("joins the draft's mandates into one text, in order", () => {
    expect(draftMandate(files)).toBe("Create vendors only after KYC passes. Never edit bank details.");
    expect(draftMandate({})).toBe("");
  });
});

describe("agentFromDraft", () => {
  it("registers the plugin's agent from its draft and attaches the World it built", () => {
    const a = agentFromDraft({ input: { name: "Vendor Onboarding", domain: "procurement", description: "Collects supplier documents." }, files, client: "Claude Code", repo: "acme/vendors" }, "vendor-desk");
    expect(a).toMatchObject({ name: "Vendor Onboarding", source: "mcp", shape: "mcp", description: "Collects supplier documents.", worldIds: ["vendor-desk"], worlds: [] });
    expect(a.tools).toEqual(["vendors.create", "documents.read"]);
    expect(a.entities).toEqual(["Vendor", "Invoice"]);
    expect(a.mandate).toBe("Create vendors only after KYC passes. Never edit bank details.");
    expect(a.notes).toContain("acme/vendors");
  });
});
