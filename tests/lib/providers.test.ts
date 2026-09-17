import { describe, expect, it } from "vitest";
import { listProviders } from "@/lib/providers";

describe("listProviders", () => {
  it("lists the shipped catalogs with labels and tool names", () => {
    const p = listProviders();
    expect(p.map((x) => x.id)).toEqual(["google-workspace", "okta", "slack", "stripe", "zendesk"]);
    expect(p.find((x) => x.id === "stripe")).toMatchObject({ label: "Stripe", kind: "payments" });
    expect(p.find((x) => x.id === "stripe")!.tools.map((t) => t.name)).toEqual(["list_payment_intents", "create_refund"]);
    expect(p.find((x) => x.id === "google-workspace")).toMatchObject({ label: "Google Workspace", kind: "email" });
  });
});
