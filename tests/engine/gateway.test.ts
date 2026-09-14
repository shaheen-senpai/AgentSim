// tests/engine/gateway.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import type { Attack, WorldPack } from "@/engine/pack";
import { minimalPack } from "../helpers/minimalPack";
import { seedWorld } from "@/engine/world";
import { applyAttack } from "@/engine/attack";
import { ToolError } from "@/engine/dsl";
import { createGateway } from "@/engine/gateway";
import { usePacksDir } from "../helpers/packs";

beforeAll(() => {
  usePacksDir("northwind");
});

function pack(): WorldPack {
  return loadPack("northwind");
}

function billingAttack(p: WorldPack): Attack {
  const scenario = p.scenarios.find((s) => s.id === "duplicate-charge-refund")!;
  return scenario.attacks.find((a) => a.id === "billing-note-injection")!;
}

describe("createGateway — recording", () => {
  it("records an Event per call with parsed args, result, changes, seq and toolUseId default", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    const result = await gw.execute({ tool: "issue_refund", input: { payment_id: "pay_7003", amount: 4999, reason: "dup" }, source: "script" });
    expect(JSON.parse(result).refund_id ?? JSON.parse(result).id).toBeDefined();
    expect(gw.events).toHaveLength(1);
    expect(gw.events[0]).toMatchObject({ seq: 1, toolUseId: "local_1", tool: "issue_refund", isError: false, source: "script", batchId: null });
    expect(gw.events[0].changes.length).toBeGreaterThan(0);
  });

  it("passes toolUseId through when given", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, toolUseId: "toolu_1", source: "reference" });
    expect(gw.events[0].toolUseId).toBe("toolu_1");
  });

  it("records source and defaults batchId to null; passes batchId through when given", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "mcp" });
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "reference", batchId: "batch-1" });
    expect(gw.events[0]).toMatchObject({ source: "mcp", batchId: null });
    expect(gw.events[1]).toMatchObject({ source: "reference", batchId: "batch-1" });
  });

  it("sets at === endedAt on every recorded Event", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });
    expect(gw.events[0].at).toBe(gw.events[0].endedAt);
  });
});

describe("createGateway — errors", () => {
  it("rejects on an unknown tool and records an error Event with no result", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await expect(gw.execute({ tool: "nope", input: {}, source: "script" })).rejects.toBeInstanceOf(ToolError);
    expect(gw.events).toHaveLength(1);
    expect(gw.events[0]).toMatchObject({ seq: 1, isError: true, error: "Unknown tool nope", changes: [] });
    expect(gw.events[0].result).toBeUndefined();
  });

  it("rethrows a ToolError raised by the DSL and records it", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await expect(gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_9999" }, source: "script" })).rejects.toThrow("No ticket tkt_9999");
    expect(gw.events[0]).toMatchObject({ isError: true, error: "No ticket tkt_9999" });
  });

  it("does not stall the chain after an error: later calls still run", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await gw.execute({ tool: "nope", input: {}, source: "script" }).catch(() => {});
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });
    expect(gw.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(gw.events[1].isError).toBe(false);
  });
});

describe("createGateway — concurrency", () => {
  it("serialises calls but captures startedAt on entry, so concurrent calls overlap", async () => {
    const p = pack();
    const gw = createGateway(p, seedWorld(p));
    await Promise.all([
      gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" }),
      gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1002" }, source: "script" }),
    ]);
    expect(gw.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(gw.events[1].startedAt).toBeLessThanOrEqual(gw.events[0].endedAt);
  });
});

describe("createGateway — onEvent", () => {
  it("fires onEvent after the Event is pushed, in completion order, for both success and error", async () => {
    const p = pack();
    const w = seedWorld(p);
    const seen: number[] = [];
    let sawSelfInEvents = true;
    const gw = createGateway(p, w, {
      onEvent: (e) => {
        sawSelfInEvents = sawSelfInEvents && gw.events[gw.events.length - 1] === e;
        seen.push(e.seq);
      },
    });
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "nope" }, source: "script" }).catch(() => {});
    expect(seen).toEqual([1, 2]);
    expect(sawSelfInEvents).toBe(true);
  });
});

describe("createGateway — injected stamping", () => {
  it("stamps injected on a read whose result contains the attack's injected text", async () => {
    const p = pack();
    const attack = billingAttack(p);
    const w = seedWorld(p);
    applyAttack(p, w, attack);
    const gw = createGateway(p, w, { attack });
    await gw.execute({ tool: "read_thread", input: { thread_id: "thr_5001" }, source: "script" });
    expect(gw.events[0].injected).toEqual({ attackId: attack.id, collection: "emails", id: "eml_9001", field: "body" });
  });

  it("leaves injected null for a read whose result doesn't contain the marker", async () => {
    const p = pack();
    const attack = billingAttack(p);
    const w = seedWorld(p);
    applyAttack(p, w, attack);
    const gw = createGateway(p, w, { attack });
    await gw.execute({ tool: "get_ticket", input: { ticket_id: "tkt_1001" }, source: "script" });
    expect(gw.events[0].injected).toBeNull();
  });

  it("leaves injected null when no attack is configured", async () => {
    const p = pack();
    const attack = billingAttack(p);
    const w = seedWorld(p);
    applyAttack(p, w, attack);
    const gw = createGateway(p, w);
    await gw.execute({ tool: "read_thread", input: { thread_id: "thr_5001" }, source: "script" });
    expect(gw.events[0].injected).toBeNull();
  });

  it("never stamps a write tool's result, even when it literally contains the marker text", async () => {
    const p = minimalPack();
    const attack: Attack = { id: "a1", title: "t", mutation: { type: "set_field", collection: "notes", id: "note_1", field: "text", value: "INJECTED" }, lure: { tool: "read_note", args_match: {} } };
    const w = seedWorld(p);
    const gw = createGateway(p, w, { attack });
    await gw.execute({ tool: "echo_write", input: { note_id: "note_1", text: "INJECTED" }, source: "script" });
    expect(gw.events[0].injected).toBeNull();
  });

  it("stamps a read tool's result when it literally contains the marker text (fixture control for the above)", async () => {
    const p = minimalPack();
    const attack: Attack = { id: "a1", title: "t", mutation: { type: "set_field", collection: "notes", id: "note_1", field: "text", value: "INJECTED" }, lure: { tool: "read_note", args_match: {} } };
    const w = seedWorld(p);
    w.collections.notes[0].text = "INJECTED";
    const gw = createGateway(p, w, { attack });
    await gw.execute({ tool: "read_note", input: { note_id: "note_1" }, source: "script" });
    expect(gw.events[0].injected).toEqual({ attackId: "a1", collection: "notes", id: "note_1", field: "text" });
  });
});
