import { describe, expect, it } from "vitest";
import { northwind } from "../helpers";
import { seedWorld } from "@/sim/world";
import { createSim } from "@/sim/sim";
import { ToolError } from "@/sim/tools";

describe("createSim", () => {
  it("appends an Event per call with parsed args, result and changes", async () => {
    const sim = createSim(seedWorld(northwind()));
    const result = await sim.execute("issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "dup" }, "toolu_1");
    expect(JSON.parse(result).refund_id).toBe("ref_0001");
    expect(sim.events).toHaveLength(1);
    expect(sim.events[0]).toMatchObject({ seq: 1, toolUseId: "toolu_1", tool: "issue_refund", isError: false, changes: ["ref_0001"], input: { payment_id: "pay_7003", amount: 4999, reason: "dup" } });
  });
  it("records failed calls as error Events and rethrows ToolError", async () => {
    const sim = createSim(seedWorld(northwind()));
    await expect(sim.execute("get_order", { order_id: "ord_9999" })).rejects.toBeInstanceOf(ToolError);
    expect(sim.events[0]).toMatchObject({ seq: 1, isError: true, error: "No order ord_9999" });
  });
  it("serialises concurrent calls so the World never double-spends", async () => {
    const sim = createSim(seedWorld(northwind()));
    const a = sim.execute("issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "a" });
    const b = sim.execute("issue_refund", { payment_id: "pay_7003", amount: 4999, reason: "b" });
    const results = await Promise.allSettled([a, b]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(sim.world.refunds).toHaveLength(1);
    expect(sim.events.map((e) => e.seq)).toEqual([1, 2]);
  });
  it("notifies onEvent after each Event", async () => {
    const seen: number[] = [];
    const sim = createSim(seedWorld(northwind()), (e) => seen.push(e.seq));
    await sim.execute("get_ticket", { ticket_id: "tkt_1001" });
    await sim.execute("get_ticket", { ticket_id: "nope" }).catch(() => {});
    expect(seen).toEqual([1, 2]);
  });
});
