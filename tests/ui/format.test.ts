import { describe, expect, it } from "vitest";
import { fmtArgs, summarizeResult, threadEmails } from "@/ui/format";

describe("format", () => {
  it("renders arguments compactly with money formatted", () => {
    expect(fmtArgs({ payment_id: "pay_7001", amount: 12000, reason: "long text" })).toBe("pay_7001 · £120.00");
    expect(fmtArgs({ ticket_id: "tkt_1001", status: "resolved" })).toBe("tkt_1001 · resolved");
  });
  it("summarises tool results per tool", () => {
    expect(summarizeResult("issue_refund", JSON.stringify({ ok: true, refund_id: "ref_0002" }))).toBe("→ ref_0002");
    expect(summarizeResult("get_order", JSON.stringify({ items: ["Down gilet"], total: 15900, status: "delivered" }))).toBe("Down gilet · £159.00 · delivered");
    expect(summarizeResult("list_payments", JSON.stringify([{ id: "pay_7002", amount: 4999 }, { id: "pay_7003", amount: 4999 }]))).toBe("pay_7002 £49.99 · pay_7003 £49.99");
    expect(summarizeResult("get_order", undefined, "No order ord_9999")).toBe("✗ No order ord_9999");
  });
  it("extracts thread emails for highlighting", () => {
    expect(threadEmails(JSON.stringify({ emails: [{ from: "a@x", body: "hi" }] }))).toEqual([{ from: "a@x", body: "hi" }]);
    expect(threadEmails("not json")).toEqual([]);
  });
});
