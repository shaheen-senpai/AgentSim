import { describe, expect, it } from "vitest";
import { northwind } from "../helpers";
import { seedWorld, snapshot } from "@/sim/world";
import { diffWorld, unchangedCount } from "@/sim/diff";

describe("diffWorld", () => {
  it("reports added and changed entities with readable summaries", () => {
    const w = seedWorld(northwind());
    const start = snapshot(w);
    w.refunds.push({ id: "ref_0001", payment_id: "pay_7003", amount: 4999, reason: "dup", created_at: w.now });
    w.tickets[0].status = "resolved";
    w.tickets[0].notes.push("done");
    w.emails.push({ id: "eml_9103", thread_id: "thr_5001", from: "support@northwind.example", to: "priya.raman@example.com", sent_at: w.now, body: "Hi" });
    const d = diffWorld(start, snapshot(w));
    expect(d).toEqual([
      { op: "added", kind: "refunds", entityId: "ref_0001", summary: "Refund £49.99 on pay_7003 (ord_1042)" },
      { op: "added", kind: "emails", entityId: "eml_9103", summary: "Email support → priya.raman@example.com" },
      { op: "changed", kind: "tickets", entityId: "tkt_1001", summary: "status open → resolved · notes 0 → 1" },
    ]);
    expect(unchangedCount(start, snapshot(w))).toBe(3 + 5 + 6 + 3 + 3 + 1); // customers, orders, payments, threads, emails(3 old), tickets(1 untouched)
  });
  it("is empty when nothing changed", () => {
    const w = seedWorld(northwind());
    expect(diffWorld(snapshot(w), snapshot(w))).toEqual([]);
  });
});
