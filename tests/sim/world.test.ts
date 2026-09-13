import { describe, expect, it } from "vitest";
import { northwind } from "../helpers";
import { ownerOf, seedWorld, snapshot } from "@/sim/world";

describe("seedWorld", () => {
  it("copies the Seed into a World with an empty refunds list", () => {
    const seed = northwind();
    const w = seedWorld(seed);
    expect(w.refunds).toEqual([]);
    expect(w.customers).toHaveLength(3);
    expect((w as unknown as { id?: string }).id).toBeUndefined();
  });
  it("is a deep copy — mutating the World leaves the Seed alone", () => {
    const seed = northwind();
    const w = seedWorld(seed);
    w.tickets[0].status = "resolved";
    expect(seed.tickets[0].status).toBe("open");
  });
});

describe("snapshot", () => {
  it("is a deep copy", () => {
    const w = seedWorld(northwind());
    const s = snapshot(w);
    w.tickets[0].notes.push("x");
    expect(s.tickets[0].notes).toEqual([]);
  });
});

describe("ownerOf", () => {
  const w = seedWorld(northwind());
  it("resolves every entity kind to a Customer", () => {
    expect(ownerOf(w, "cus_001")).toBe("cus_001");
    expect(ownerOf(w, "ord_1040")).toBe("cus_002");
    expect(ownerOf(w, "pay_7003")).toBe("cus_001");
    expect(ownerOf(w, "thr_5003")).toBe("cus_003");
    expect(ownerOf(w, "eml_9001")).toBe("cus_001");
    expect(ownerOf(w, "tkt_1002")).toBe("cus_002");
  });
  it("resolves a Refund through its Payment", () => {
    w.refunds.push({ id: "ref_0001", payment_id: "pay_7004", amount: 100, reason: "t", created_at: w.now });
    expect(ownerOf(w, "ref_0001")).toBe("cus_002");
  });
  it("returns null for unknown ids", () => {
    expect(ownerOf(w, "ord_9999")).toBeNull();
    expect(ownerOf(w, "nonsense")).toBeNull();
  });
});
