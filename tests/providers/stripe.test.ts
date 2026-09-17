import { describe, expect, it } from "vitest";
import { loadProviderTools } from "@/engine/pack";
import type { EntitySpec, WorldPack } from "@/engine/pack";
import { runTool, ToolError } from "@/engine/dsl";
import { seedWorld } from "@/engine/world";
import type { Row } from "@/engine/types";

describe("stripe provider catalog", () => {
  it("parses and exposes create_refund and list_payment_intents", () => {
    const tools = loadProviderTools("stripe");
    expect(Object.keys(tools).sort()).toEqual(["create_refund", "list_payment_intents"]);
    expect(tools.create_refund.input.payment_intent).toBeDefined();
    expect(tools.create_refund.input.amount.optional).toBe(true);
    expect(tools.list_payment_intents.input.customer).toBeDefined();
  });
});

/**
 * A minimal synthetic pack — just enough of Northwind's own entity shapes (customers → orders →
 * payments → refunds) to run the real, YAML-loaded `create_refund` tool through `runTool` and
 * exercise its `coalesce()` guard/set logic for real, not just confirm the YAML parses.
 */
function stripeFixturePack(refundRows: Row[]): WorldPack {
  const customers: EntitySpec = { label: "Customer", id_prefix: "cus_", owner: "self", fields: { id: { type: "string" } } };
  const orders: EntitySpec = {
    label: "Order", id_prefix: "ord_", owner: { via: "customer_id" },
    fields: { id: { type: "string" }, customer_id: { type: "string", ref: "customers" } },
  };
  const payments: EntitySpec = {
    label: "Payment", id_prefix: "pay_", owner: { via: "order_id" },
    fields: { id: { type: "string" }, order_id: { type: "string", ref: "orders" }, amount: { type: "int" } },
  };
  const refunds: EntitySpec = {
    label: "Refund", id_prefix: "ref_", owner: { via: "payment_id" },
    fields: {
      id: { type: "string" }, payment_id: { type: "string", ref: "payments" },
      amount: { type: "int" }, reason: { type: "string" }, created_at: { type: "string" },
    },
  };

  const createRefund = loadProviderTools("stripe").create_refund;

  return {
    meta: {
      id: "stripe-fixture", name: "Stripe Fixture", domain: "test", description: "test pack", principal: "customers",
      systems: { payments: { label: "Payments" } },
      entities: { customers, orders, payments, refunds },
    },
    seed: {
      now: "2026-01-01T00:00:00Z",
      currency: "USD",
      rows: {
        customers: [{ id: "cus_1" }],
        orders: [{ id: "ord_1", customer_id: "cus_1" }],
        payments: [{ id: "pay_1", order_id: "ord_1", amount: 10000 }],
        refunds: refundRows,
      },
    },
    tools: { create_refund: createRefund },
    scenarios: [],
    agents: {},
    files: {},
  };
}

describe("create_refund (via runTool, against a synthetic World)", () => {
  it("refunds a specified amount within the refundable balance", () => {
    const pack = stripeFixturePack([]);
    const w = seedWorld(pack);
    const r = runTool(pack, w, "create_refund", { payment_intent: "pay_1", amount: 4000 });
    expect(JSON.parse(r.result)).toEqual({ id: "ref_0001", payment_intent: "pay_1", amount: 4000, status: "succeeded" });
    expect(r.changes).toEqual([{ collection: "refunds", id: "ref_0001", op: "create" }]);
    expect(w.collections.refunds[0]).toMatchObject({ payment_id: "pay_1", amount: 4000, reason: "requested_by_customer" });
  });

  it("omitting amount refunds the full remaining balance (coalesce default)", () => {
    const pack = stripeFixturePack([{ id: "ref_0001", payment_id: "pay_1", amount: 4000, reason: "prior", created_at: "2025-01-01T00:00:00Z" }]);
    const w = seedWorld(pack);
    const r = runTool(pack, w, "create_refund", { payment_intent: "pay_1" });
    expect(JSON.parse(r.result)).toEqual({ id: "ref_0002", payment_intent: "pay_1", amount: 6000, status: "succeeded" });
    expect(w.collections.refunds.at(-1)).toMatchObject({ amount: 6000 });
  });

  it("rejects a refund that would exceed the remaining refundable balance", () => {
    const pack = stripeFixturePack([{ id: "ref_0001", payment_id: "pay_1", amount: 9000, reason: "prior", created_at: "2025-01-01T00:00:00Z" }]);
    const w = seedWorld(pack);
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_1", amount: 2000 })).toThrow(ToolError);
    expect(() => runTool(pack, w, "create_refund", { payment_intent: "pay_1", amount: 2000 }))
      .toThrow("Refund of 2000 exceeds refundable balance 1000 on pay_1");
    // Nothing was written by the rejected call.
    expect(w.collections.refunds).toHaveLength(1);
  });
});
