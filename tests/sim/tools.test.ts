import { describe, expect, it } from "vitest";
import { northwind } from "../helpers";
import { seedWorld } from "@/sim/world";
import { TOOLS, ToolError, executeTool } from "@/sim/tools";

describe("tool surface", () => {
  it("has exactly the ten tools over four Systems", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual([
      "add_ticket_note", "get_customer", "get_order", "get_ticket", "issue_refund",
      "list_orders", "list_payments", "read_thread", "send_email", "set_ticket_status",
    ]);
    expect(new Set(TOOLS.map((t) => t.system))).toEqual(new Set(["support", "email", "orders", "payments"]));
  });
});

describe("executeTool", () => {
  it("returns JSON results and reports no changes for reads", () => {
    const w = seedWorld(northwind());
    const r = executeTool(w, "read_thread", { thread_id: "thr_5001" });
    expect(r.changes).toEqual([]);
    expect(JSON.parse(r.result).emails).toHaveLength(1);
  });
  it("issues a refund against a payment and reports the new Refund id", () => {
    const w = seedWorld(northwind());
    const r = executeTool(w, "issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" });
    expect(JSON.parse(r.result)).toEqual({ ok: true, refund_id: "ref_0001", amount: 4999, payment_id: "pay_7003" });
    expect(r.changes).toEqual(["ref_0001"]);
    expect(w.refunds[0].created_at).toBe(w.now);
  });
  it("rejects a refund larger than the remaining refundable balance", () => {
    const w = seedWorld(northwind());
    expect(() => executeTool(w, "issue_refund", { payment_id: "pay_7003", amount: 12000, reason: "goodwill" })).toThrow(/exceeds refundable balance 4999/);
    executeTool(w, "issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" });
    expect(() => executeTool(w, "issue_refund", { payment_id: "pay_7003", amount: 1, reason: "again" })).toThrow(ToolError);
  });
  it("sends an email to the thread's customer from support", () => {
    const w = seedWorld(northwind());
    const r = executeTool(w, "send_email", { thread_id: "thr_5001", body: "Hi Priya" });
    const sent = w.emails.at(-1)!;
    expect(sent.id).toBe(JSON.parse(r.result).id);
    expect(sent.from).toBe("support@northwind.example");
    expect(sent.to).toBe("priya.raman@example.com");
    expect(r.changes).toEqual([sent.id]);
  });
  it("updates tickets and reports the ticket as changed", () => {
    const w = seedWorld(northwind());
    executeTool(w, "add_ticket_note", { ticket_id: "tkt_1001", note: "looked into it" });
    const r = executeTool(w, "set_ticket_status", { ticket_id: "tkt_1001", status: "resolved" });
    expect(r.changes).toEqual(["tkt_1001"]);
    expect(w.tickets[0]).toMatchObject({ status: "resolved", notes: ["looked into it"] });
  });
  it("throws ToolError for unknown tools, bad arguments and unknown ids", () => {
    const w = seedWorld(northwind());
    expect(() => executeTool(w, "delete_everything", {})).toThrow(/Unknown tool/);
    expect(() => executeTool(w, "set_ticket_status", { ticket_id: "tkt_1001", status: "closed" })).toThrow(/Invalid arguments/);
    expect(() => executeTool(w, "get_order", { order_id: "ord_9999" })).toThrow(/No order ord_9999/);
  });
});
