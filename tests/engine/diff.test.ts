import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import { seedWorld, snapshot } from "@/engine/world";
import { diffWorld, unchangedCount } from "@/engine/diff";
import { usePacksDir } from "../helpers/packs";

beforeAll(() => {
  usePacksDir("northwind");
});

function totalRows(w: ReturnType<typeof seedWorld>): number {
  return Object.values(w.collections).reduce((n, rows) => n + rows.length, 0);
}

describe("diffWorld", () => {
  it("reports an added refund and a changed ticket, in pack declaration order", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const before = snapshot(w);
    w.collections.refunds.push({ id: "ref_0001", payment_id: "pay_7003", amount: 4999, reason: "dup", created_at: w.now });
    w.collections.tickets[0].status = "resolved";
    const after = snapshot(w);

    const d = diffWorld(pack, before, after);
    expect(d).toEqual([
      { op: "added", collection: "refunds", entityId: "ref_0001", summary: "Refund ref_0001 · £49.99" },
      { op: "changed", collection: "tickets", entityId: "tkt_1001", summary: "status open → resolved" },
    ]);
    expect(unchangedCount(pack, before, after)).toBe(totalRows(after) - 2);
  });

  it("is empty when nothing changed", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(diffWorld(pack, snapshot(w), snapshot(w))).toEqual([]);
    expect(unchangedCount(pack, snapshot(w), snapshot(w))).toBe(totalRows(w));
  });

  it("summarizes array field changes by length", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const before = snapshot(w);
    w.collections.tickets[0].notes = ["called customer"];
    const after = snapshot(w);
    expect(diffWorld(pack, before, after)).toEqual([
      { op: "changed", collection: "tickets", entityId: "tkt_1001", summary: "notes 0 → 1" },
    ]);
  });
});
