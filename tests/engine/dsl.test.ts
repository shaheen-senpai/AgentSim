// tests/engine/dsl.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import type { EntitySpec, ToolDef, WorldPack } from "@/engine/pack";
import { seedWorld } from "@/engine/world";
import { runTool, toolSubject, ToolError } from "@/engine/dsl";
import { usePacksDir } from "../helpers/packs";

beforeAll(() => {
  usePacksDir("northwind");
});

describe("tool declarations", () => {
  it("has exactly the ten tools over four systems", () => {
    const pack = loadPack("northwind");
    expect(Object.keys(pack.tools).sort()).toEqual([
      "add_ticket_note", "get_customer", "get_order", "get_ticket", "issue_refund",
      "list_orders", "list_payments", "read_thread", "send_email", "set_ticket_status",
    ]);
    expect(new Set(Object.values(pack.tools).map((t) => t.system))).toEqual(new Set(["support", "email", "orders", "payments"]));
  });
});

describe("runTool — reads", () => {
  it("returns JSON results and reports no changes for reads", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "read_thread", { thread_id: "thr_5001" });
    expect(r.changes).toEqual([]);
    expect((JSON.parse(r.result) as { emails: unknown[] }).emails).toHaveLength(1);
  });

  it("read_thread includes emails oldest first, regardless of row order", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    w.collections.emails.push({
      id: "eml_9099", thread_id: "thr_5001", from: "support@northwind.example", to: "priya.raman@example.com",
      sent_at: "2026-09-10T00:00:00Z", body: "earlier",
    });
    const r = runTool(pack, w, "read_thread", { thread_id: "thr_5001" });
    const value = JSON.parse(r.result) as { emails: { id: string }[] };
    expect(value.emails.map((e) => e.id)).toEqual(["eml_9099", "eml_9001"]);
  });

  it("get_customer returns the bare customer row", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "get_customer", { customer_id: "cus_001" });
    expect(JSON.parse(r.result)).toEqual(w.collections.customers[0]);
    expect(r.changes).toEqual([]);
  });

  it("get_order returns the bare order row", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "get_order", { order_id: "ord_1042" });
    expect(JSON.parse(r.result)).toEqual(w.collections.orders.find((o) => o.id === "ord_1042"));
  });

  it("list_orders returns an array of the customer's orders", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "list_orders", { customer_id: "cus_001" });
    const value = JSON.parse(r.result) as { id: string }[];
    expect(Array.isArray(value)).toBe(true);
    expect(value.map((o) => o.id).sort()).toEqual(["ord_1038", "ord_1042"]);
    expect(r.changes).toEqual([]);
  });

  it("list_payments includes refunds already issued against each payment", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" });
    const r = runTool(pack, w, "list_payments", { order_id: "ord_1042" });
    const value = JSON.parse(r.result) as { id: string; refunds: unknown[] }[];
    expect(value.map((p) => p.id).sort()).toEqual(["pay_7002", "pay_7003"]);
    expect(value.find((p) => p.id === "pay_7003")!.refunds).toHaveLength(1);
    expect(value.find((p) => p.id === "pay_7002")!.refunds).toEqual([]);
    expect(r.changes).toEqual([]);
  });
});

describe("runTool — writes", () => {
  it("issues a refund against a payment and reports the new Refund id", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" });
    expect(JSON.parse(r.result)).toEqual({ ok: true, refund_id: "ref_0001", amount: 4999, payment_id: "pay_7003" });
    expect(r.changes).toEqual([{ collection: "refunds", id: "ref_0001", op: "create" }]);
    expect(w.collections.refunds[0].created_at).toBe(w.now);
  });

  it("rejects a refund larger than the remaining refundable balance", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 12000, reason: "goodwill" })).toThrow(/exceeds refundable balance 4999/);
    runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" });
    expect(() => runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 1, reason: "again" })).toThrow(ToolError);
  });

  it("rejects an over-refund with the exact balance message", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 5000, reason: "goodwill" }))
      .toThrow("Refund of 5000 exceeds refundable balance 4999 on pay_7003");
  });

  it("issue_refund ids increment as ref_0001, ref_0002, ...", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r1 = runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 1000, reason: "a" });
    const r2 = runTool(pack, w, "issue_refund", { payment_id: "pay_7005", amount: 500, reason: "b" });
    expect((JSON.parse(r1.result) as { refund_id: string }).refund_id).toBe("ref_0001");
    expect((JSON.parse(r2.result) as { refund_id: string }).refund_id).toBe("ref_0002");
  });

  it("sends an email to the thread's customer from support", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "send_email", { thread_id: "thr_5001", body: "Hi Priya" });
    const sent = w.collections.emails.at(-1)!;
    expect(sent.id).toBe((JSON.parse(r.result) as { id: string }).id);
    expect(sent.from).toBe("support@northwind.example");
    expect(sent.to).toBe("priya.raman@example.com");
    expect(sent.sent_at).toBe(w.now);
    expect(r.changes).toEqual([{ collection: "emails", id: sent.id as string, op: "create" }]);
  });

  it("send_email ids continue from 9100 + the existing email count", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const startCount = w.collections.emails.length;
    const r = runTool(pack, w, "send_email", { thread_id: "thr_5001", body: "hi" });
    expect((JSON.parse(r.result) as { id: string }).id).toBe(`eml_${9100 + startCount}`);
  });

  it("updates tickets and reports the ticket as changed", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    runTool(pack, w, "add_ticket_note", { ticket_id: "tkt_1001", note: "looked into it" });
    const r = runTool(pack, w, "set_ticket_status", { ticket_id: "tkt_1001", status: "resolved" });
    expect(r.changes).toEqual([{ collection: "tickets", id: "tkt_1001", op: "update" }]);
    expect(w.collections.tickets[0]).toMatchObject({ status: "resolved", notes: ["looked into it"] });
  });

  it("add_ticket_note appends and returns the running note count", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r1 = runTool(pack, w, "add_ticket_note", { ticket_id: "tkt_1001", note: "first" });
    expect(JSON.parse(r1.result)).toEqual({ ok: true, notes: 1 });
    const r2 = runTool(pack, w, "add_ticket_note", { ticket_id: "tkt_1001", note: "second" });
    expect(JSON.parse(r2.result)).toEqual({ ok: true, notes: 2 });
    expect(w.collections.tickets[0].notes).toEqual(["first", "second"]);
  });

  it("set_ticket_status returns the new status", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "set_ticket_status", { ticket_id: "tkt_1001", status: "pending" });
    expect(JSON.parse(r.result)).toEqual({ ok: true, status: "pending" });
  });
});

describe("runTool — errors", () => {
  it("throws Unknown tool for an undeclared tool", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "nope", {})).toThrow("Unknown tool nope");
    expect(() => runTool(pack, w, "nope", {})).toThrow(ToolError);
  });

  it("throws Invalid arguments for bad enum input", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "set_ticket_status", { ticket_id: "tkt_1001", status: "closed" })).toThrow(/Invalid arguments for set_ticket_status/);
  });

  it("throws Invalid arguments for issue_refund when the amount fails validation", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "issue_refund", { payment_id: "pay_7003", amount: 0, reason: "x" })).toThrow(/Invalid arguments for issue_refund/);
  });

  it("throws No order for an unknown order id", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "get_order", { order_id: "ord_9999" })).toThrow(/No order ord_9999/);
  });

  it("throws No ticket for an unknown ticket id", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "get_ticket", { ticket_id: "tkt_404" })).toThrow("No ticket tkt_404");
  });

  it("throws No payment for an unknown payment id via lookup", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "issue_refund", { payment_id: "pay_9999", amount: 10, reason: "x" })).toThrow("No payment pay_9999");
  });
});

describe("runTool — result shape", () => {
  it("returns the parsed args alongside the result", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "get_ticket", { ticket_id: "tkt_1001" });
    expect(r.args).toEqual({ ticket_id: "tkt_1001" });
  });

  it("value matches the parsed result", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "get_customer", { customer_id: "cus_001" });
    expect(r.value).toEqual(JSON.parse(r.result));
  });
});

describe("runTool — create validates against the entity schema", () => {
  /** A minimal hand-built pack (bypassing YAML/pack.yaml) exercising a create whose `set` violates the entity schema. */
  function fixturePack(): WorldPack {
    const widgets: EntitySpec = {
      label: "Widget",
      id_prefix: "wid_",
      owner: "self",
      fields: { id: { type: "string" }, status: { type: "enum", values: ["a", "b"] } },
    };
    const makeWidget: ToolDef = {
      name: "make_widget",
      system: "sys",
      kind: "write",
      description: "d",
      input: { status: { type: "string" } },
      subject: { collection: "widgets", id: "${input.status}" },
      op: "create",
      collection: "widgets",
      new_id: { prefix: "wid_" },
      set: { status: "${input.status}" },
    };
    return {
      meta: {
        id: "fixture", name: "Fixture", domain: "test", description: "test pack", principal: "widgets",
        systems: { sys: { label: "Sys" } },
        entities: { widgets },
      },
      seed: { now: "2026-01-01T00:00:00Z", currency: "GBP", rows: { widgets: [] } },
      tools: { make_widget: makeWidget },
      scenarios: [],
      agents: {},
      files: {},
    };
  }

  it("throws ToolError when a create's set violates the entity schema", () => {
    const pack = fixturePack();
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "make_widget", { status: "nope" })).toThrow(ToolError);
    expect(() => runTool(pack, w, "make_widget", { status: "nope" })).toThrow(/make_widget produced an invalid widget/);
  });

  it("still creates a valid widget", () => {
    const pack = fixturePack();
    const w = seedWorld(pack);
    const r = runTool(pack, w, "make_widget", { status: "a" });
    expect(r.changes).toEqual([{ collection: "widgets", id: "wid_1", op: "create" }]);
    expect(w.collections.widgets[0]).toEqual({ id: "wid_1", status: "a" });
  });
});

describe("toolSubject", () => {
  it("templates the tool's subject id from args", () => {
    const pack = loadPack("northwind");
    expect(toolSubject(pack, pack.tools.issue_refund, { payment_id: "pay_7003", amount: 1, reason: "x" }))
      .toEqual({ collection: "payments", id: "pay_7003" });
  });

  it("returns null when the templated id is not a string", () => {
    const pack = loadPack("northwind");
    const fixtureTool: ToolDef = { ...pack.tools.issue_refund, subject: { collection: "payments", id: "${input.amount}" } };
    expect(toolSubject(pack, fixtureTool, { amount: 42 })).toBeNull();
  });
});
