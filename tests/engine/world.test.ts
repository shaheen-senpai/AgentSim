import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import { entityLabel, findRow, matchWhere, resolveWhereKey, rowsOf, seedWorld, snapshot } from "@/engine/world";
import { collectionOfId, ownerOf } from "@/engine/ownership";
import type { Row } from "@/engine/types";
import { copyFixturePacks } from "../helpers/packs";

beforeAll(() => {
  copyFixturePacks("northwind");
});

describe("seedWorld", () => {
  it("produces every declared entity's collection, seeded from the pack", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(Object.keys(w.collections).sort()).toEqual(Object.keys(pack.meta.entities).sort());
    expect(w.now).toBe(pack.seed.now);
    expect(w.currency).toBe(pack.seed.currency);
    expect(rowsOf(w, "customers")).toHaveLength(3);
    expect(rowsOf(w, "refunds")).toEqual([]);
  });

  it("is a deep clone — mutating the World leaves the pack's seed alone", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    w.collections.tickets[0].status = "resolved";
    expect(pack.seed.rows.tickets[0].status).toBe("open");
  });
});

describe("snapshot", () => {
  it("is a deep clone", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const s = snapshot(w);
    (w.collections.tickets[0].notes as string[]).push("x");
    expect(s.collections.tickets[0].notes).toEqual([]);
  });
});

describe("rowsOf / findRow", () => {
  it("returns [] for an absent collection and undefined for a missing row", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(rowsOf(w, "nonexistent")).toEqual([]);
    expect(findRow(w, "customers", "cus_001")?.id).toBe("cus_001");
    expect(findRow(w, "customers", "cus_999")).toBeUndefined();
  });
});

describe("ownerOf", () => {
  it("resolves every entity kind to its owning customer", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(ownerOf(pack, w, "customers", "cus_001")).toBe("cus_001");
    expect(ownerOf(pack, w, "orders", "ord_1042")).toBe("cus_001");
    expect(ownerOf(pack, w, "payments", "pay_7001")).toBe("cus_001");
    expect(ownerOf(pack, w, "emails", "eml_9001")).toBe("cus_001");
    expect(ownerOf(pack, w, "tickets", "tkt_1001")).toBe("cus_001");
  });

  it("returns null for an unknown id", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(ownerOf(pack, w, "orders", "ord_9999")).toBeNull();
  });

  it("returns null for a non-string id instead of throwing", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(ownerOf(pack, w, "orders", undefined)).toBeNull();
    expect(ownerOf(pack, w, "orders", 42)).toBeNull();
  });

  it("returns null for an unknown collection and a dangling ref", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    expect(ownerOf(pack, w, "nonexistent", "cus_001")).toBeNull();
    w.collections.orders.push({ id: "ord_9001", customer_id: "cus_missing", items: [], total: 0, placed_at: w.now, status: "shipped" });
    expect(ownerOf(pack, w, "orders", "ord_9001")).toBeNull();
  });
});

describe("collectionOfId", () => {
  it("finds the collection by id_prefix", () => {
    const pack = loadPack("northwind");
    expect(collectionOfId(pack, "ref_0001")).toBe("refunds");
    expect(collectionOfId(pack, "cus_001")).toBe("customers");
  });

  it("returns null when no prefix matches", () => {
    const pack = loadPack("northwind");
    expect(collectionOfId(pack, "xyz_0001")).toBeNull();
  });
});

describe("resolveWhereKey / matchWhere", () => {
  /** A refund row created against pay_7003, pushed into the World like a real `issue_refund` call would. */
  function refundFor(w: ReturnType<typeof seedWorld>): Row {
    const row: Row = { id: "ref_0001", payment_id: "pay_7003", amount: 4999, reason: "dup", created_at: w.now };
    w.collections.refunds.push(row);
    return row;
  }

  it("hops through a ref field", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const refund = refundFor(w);
    expect(resolveWhereKey(pack, w, refund, "payment_id.order_id")).toBe("ord_1042");
    expect(resolveWhereKey(pack, w, refund, "amount")).toBe(4999);
  });

  it("resolves $owner to the row's principal", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const refund = refundFor(w);
    expect(resolveWhereKey(pack, w, refund, "$owner")).toBe("cus_001");
  });

  it("matchWhere combines multiple hop keys with JSON equality", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const refund = refundFor(w);
    expect(matchWhere(pack, w, refund, { "payment_id.order_id": "ord_1042", amount: 4999 })).toBe(true);
    expect(matchWhere(pack, w, refund, { "payment_id.order_id": "ord_9999" })).toBe(false);
  });

  // The runtime half of the unscoped-read bug. `JSON.stringify(undefined)` is `undefined`, so a key
  // that does not resolve, compared against a value that does not either (an omitted optional tool
  // input), used to compare `undefined === undefined` and pass — on *every* row. A `where` a pack
  // author cannot satisfy must scope a read to nothing, never to everything.
  it("matchWhere: a `where` value of undefined matches no row, even one missing that field", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const refund = refundFor(w);

    expect(matchWhere(pack, w, refund, { no_such_field: undefined })).toBe(false);
    expect(matchWhere(pack, w, refund, { amount: undefined })).toBe(false);
    // …and it poisons the whole clause, not just its own key.
    expect(matchWhere(pack, w, refund, { amount: 4999, no_such_field: undefined })).toBe(false);
    // Every row of the collection, so the read is scoped to nothing rather than to everything.
    expect(rowsOf(w, "payments").filter((r) => matchWhere(pack, w, r, { no_such_field: undefined }))).toEqual([]);
  });

  it("matchWhere: an absent field still matches an explicit null, which is a value the author wrote", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const refund = refundFor(w);
    expect(matchWhere(pack, w, refund, { reason: null })).toBe(false); // present, and not null
    expect(matchWhere(pack, w, refund, { reason: "dup" })).toBe(true);
  });

  it("matchWhere on $owner", () => {
    const pack = loadPack("northwind");
    const w = seedWorld(pack);
    const refund = refundFor(w);
    expect(matchWhere(pack, w, refund, { $owner: "cus_001" })).toBe(true);
    expect(matchWhere(pack, w, refund, { $owner: "cus_002" })).toBe(false);
  });
});

describe("entityLabel", () => {
  it("returns the pack's declared label", () => {
    const pack = loadPack("northwind");
    expect(entityLabel(pack, "customers")).toBe("Customer");
    expect(entityLabel(pack, "refunds")).toBe("Refund");
  });

  it("falls back to the collection name when the entity is unknown", () => {
    const pack = loadPack("northwind");
    expect(entityLabel(pack, "widgets")).toBe("widgets");
  });
});
