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
  it("has exactly the nine tools over four systems", () => {
    const pack = loadPack("northwind");
    expect(Object.keys(pack.tools).sort()).toEqual([
      "create_refund", "get_customer", "get_order", "get_thread", "get_ticket",
      "list_orders", "list_payment_intents", "send_email", "update_ticket",
    ]);
    expect(new Set(Object.values(pack.tools).map((t) => t.system))).toEqual(new Set(["support", "email", "orders", "payments"]));
  });
});

describe("runTool — reads", () => {
  it("returns JSON results and reports no changes for reads", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "get_thread", { thread_id: "thr_5001" });
    expect(r.changes).toEqual([]);
    expect((JSON.parse(r.result) as { messages: unknown[] }).messages).toHaveLength(1);
  });

  it("get_thread includes messages oldest first, regardless of row order", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    w.collections.emails.push({
      id: "eml_9099", thread_id: "thr_5001", from: "support@northwind.example", to: "priya.raman@example.com",
      sent_at: "2026-09-10T00:00:00Z", body: "earlier",
    });
    const r = runTool(pack, w, "get_thread", { thread_id: "thr_5001" });
    const value = JSON.parse(r.result) as { messages: { id: string }[] };
    expect(value.messages.map((e) => e.id)).toEqual(["eml_9099", "eml_9001"]);
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

  it("list_payment_intents includes refunds already issued against each payment", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 4999, reason: "duplicate" });
    const r = runTool(pack, w, "list_payment_intents", { customer: "cus_001" });
    const value = JSON.parse(r.result) as { id: string; refunds: unknown[] }[];
    expect(value.map((p) => p.id).sort()).toEqual(["pay_7001", "pay_7002", "pay_7003"]);
    expect(value.find((p) => p.id === "pay_7003")!.refunds).toHaveLength(1);
    expect(value.find((p) => p.id === "pay_7002")!.refunds).toEqual([]);
    expect(r.changes).toEqual([]);
  });
});

describe("runTool — writes", () => {
  it("issues a refund against a payment and reports the new Refund id", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 4999, reason: "duplicate" });
    expect(JSON.parse(r.result)).toEqual({ id: "ref_0001", payment_intent: "pay_7003", amount: 4999, status: "succeeded" });
    expect(r.changes).toEqual([{ collection: "refunds", id: "ref_0001", op: "create" }]);
    expect(w.collections.refunds[0].created_at).toBe(w.now);
  });

  it("rejects a refund larger than the remaining refundable balance", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 12000, reason: "requested_by_customer" })).toThrow(/exceeds refundable balance 4999/);
    runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 4999, reason: "duplicate" });
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 1, reason: "requested_by_customer" })).toThrow(ToolError);
  });

  it("rejects an over-refund with the exact balance message", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 5000, reason: "requested_by_customer" }))
      .toThrow("Refund of 5000 exceeds refundable balance 4999 on pay_7003");
  });

  it("create_refund ids increment as ref_0001, ref_0002, ...", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r1 = runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 1000, reason: "duplicate" });
    const r2 = runTool(pack, w, "create_refund", { payment_intent: "pay_7005", amount: 500, reason: "duplicate" });
    expect((JSON.parse(r1.result) as { id: string }).id).toBe("ref_0001");
    expect((JSON.parse(r2.result) as { id: string }).id).toBe("ref_0002");
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
    const r = runTool(pack, w, "update_ticket", { ticket_id: "tkt_1001", status: "solved", comment: "looked into it" });
    expect(r.changes).toEqual([{ collection: "tickets", id: "tkt_1001", op: "update" }]);
    expect(w.collections.tickets[0]).toMatchObject({ status: "solved", notes: ["looked into it"] });
  });

  it("update_ticket appends multiple comments to notes over separate calls", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    runTool(pack, w, "update_ticket", { ticket_id: "tkt_1001", comment: "first" });
    runTool(pack, w, "update_ticket", { ticket_id: "tkt_1001", comment: "second" });
    expect(w.collections.tickets[0].notes).toEqual(["first", "second"]);
  });

  it("update_ticket returns the new status", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const r = runTool(pack, w, "update_ticket", { ticket_id: "tkt_1001", status: "pending" });
    expect(JSON.parse(r.result)).toEqual({ id: "tkt_1001", status: "pending" });
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
    expect(() => runTool(pack, w, "update_ticket", { ticket_id: "tkt_1001", status: "resolved" })).toThrow(/Invalid arguments for update_ticket/);
  });

  it("throws Invalid arguments for create_refund when reason fails validation", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_7003", amount: 10, reason: "goodwill" })).toThrow(/Invalid arguments for create_refund/);
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
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_9999", amount: 10, reason: "duplicate" })).toThrow("No payment pay_9999");
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
        id: "fixture", name: "Fixture", domain: "test", description: "test pack", principal: "widgets", status: "ready", mandates: {},
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

/**
 * The composed failure the `where` fixes close, end to end through `runTool`.
 *
 * `validateTools` now rejects a pack whose tool `where` names no declared field, so this pack is
 * hand-built to get past it — the probe that found the bug validated clean before that fix. The
 * runtime half is what is under test here: an unresolvable key whose templated value is also
 * `undefined` used to match every row and hand the agent the whole collection.
 */
describe("runTool — an unscoped `where` returns nothing, never everything", () => {
  const notes: EntitySpec = { label: "Note", id_prefix: "note_", owner: "self", fields: { id: { type: "string" }, text: { type: "string" } } };

  function probePack(where: Record<string, unknown>): WorldPack {
    const listNotes: ToolDef = {
      name: "list_notes",
      system: "sys",
      kind: "read",
      description: "d",
      input: { q: { type: "string", optional: true } },
      subject: { collection: "notes", id: "${input.q}" },
      op: "list",
      collection: "notes",
      where,
    };
    return {
      meta: { id: "probe", name: "Probe", domain: "test", description: "test pack", principal: "notes", status: "ready", mandates: {}, systems: { sys: { label: "Sys" } }, entities: { notes } },
      seed: { now: "2026-01-01T00:00:00Z", currency: "GBP", rows: { notes: [{ id: "note_1", text: "a" }, { id: "note_2", text: "b" }] } },
      tools: { list_notes: listNotes },
      scenarios: [],
      agents: {},
      files: {},
    };
  }

  it("returns no rows when an unresolvable key is compared against an omitted optional input", () => {
    const pack = probePack({ no_such_field: "${input.q}" });
    const w = seedWorld(pack);
    expect(JSON.parse(runTool(pack, w, "list_notes", {}).result)).toEqual([]);
  });

  it("returns no rows when a declared key is compared against an omitted optional input", () => {
    const pack = probePack({ text: "${input.q}" });
    const w = seedWorld(pack);
    expect(JSON.parse(runTool(pack, w, "list_notes", {}).result)).toEqual([]);
    // …and still filters normally when the input is supplied.
    expect(JSON.parse(runTool(pack, w, "list_notes", { q: "b" }).result)).toEqual([{ id: "note_2", text: "b" }]);
  });
});

describe("runTool — create refuses to mint an id that already exists", () => {
  /** `nextId` counts rows, so a Seed whose ids are not contiguous from `start` can collide. */
  function collidingPack(): WorldPack {
    const widgets: EntitySpec = { label: "Widget", id_prefix: "wid_", owner: "self", fields: { id: { type: "string" }, name: { type: "string" } } };
    const makeWidget: ToolDef = {
      name: "make_widget",
      system: "sys",
      kind: "write",
      description: "d",
      input: { name: { type: "string" } },
      subject: { collection: "widgets", id: "${input.name}" },
      op: "create",
      collection: "widgets",
      new_id: { prefix: "wid_" },
      set: { name: "${input.name}" },
    };
    return {
      meta: { id: "collide", name: "Collide", domain: "test", description: "test pack", principal: "widgets", status: "ready", mandates: {}, systems: { sys: { label: "Sys" } }, entities: { widgets } },
      // One seeded row, but numbered 2 — so `nextId` mints `wid_2`, which is taken.
      seed: { now: "2026-01-01T00:00:00Z", currency: "GBP", rows: { widgets: [{ id: "wid_2", name: "seeded" }] } },
      tools: { make_widget: makeWidget },
      scenarios: [],
      agents: {},
      files: {},
    };
  }

  it("throws ToolError rather than pushing a duplicate id", () => {
    const pack = collidingPack();
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "make_widget", { name: "new" })).toThrow(ToolError);
    expect(() => runTool(pack, w, "make_widget", { name: "new" })).toThrow(/duplicate widget id wid_2/);
    // Nothing was written: `newRows()` diffs by id set, so a silent duplicate would make an
    // `entity_created` Check fail for a reason nothing in the Run explains.
    expect(w.collections.widgets).toEqual([{ id: "wid_2", name: "seeded" }]);
  });
});

describe("toolSubject", () => {
  it("templates the tool's subject id from args", () => {
    const pack = loadPack("northwind");
    expect(toolSubject(pack, pack.tools.create_refund, { payment_intent: "pay_7003", amount: 1, reason: "duplicate" }))
      .toEqual({ collection: "payments", id: "pay_7003" });
  });

  it("returns null when the templated id is not a string", () => {
    const pack = loadPack("northwind");
    const fixtureTool: ToolDef = { ...pack.tools.create_refund, subject: { collection: "payments", id: "${input.amount}" } };
    expect(toolSubject(pack, fixtureTool, { amount: 42 })).toBeNull();
  });
});
