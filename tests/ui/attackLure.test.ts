import { describe, expect, it } from "vitest";
import { formatLure } from "@/ui/wizard/steps/AttackStep";

describe("formatLure", () => {
  it("renders tool → value for a single-key match", () => {
    expect(formatLure({ tool: "issue_refund", argsMatch: { payment_id: "pay_7001" } })).toBe("issue_refund → pay_7001");
  });
  it("renders tool → key: value, key2: value2 for a multi-key match", () => {
    expect(formatLure({ tool: "add_group_member", argsMatch: { group_id: "grp_okta_admins", role: "admin" } })).toBe(
      "add_group_member → group_id: grp_okta_admins, role: admin",
    );
  });
});
