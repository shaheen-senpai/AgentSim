import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import { entityViews } from "@/lib/entityViews";
import { usePacksDir } from "../helpers/packs";

beforeAll(() => {
  usePacksDir();
});

describe("entityViews (northwind)", () => {
  it("describes every entity with its chain, untrusted field and fields", () => {
    const v = entityViews(loadPack("northwind"));
    const emails = v.entities.find((e) => e.name === "emails")!;
    expect(emails.chain).toEqual(["emails", "threads", "customers"]);
    expect(emails.untrusted).toBe("body");
    expect(emails.hasText).toBe(true);
    expect(emails.prefix).toBe("eml_");
    expect(emails.ownedVia).toBe("thread_id");
    expect(emails.fields.find((f) => f.name === "thread_id")).toEqual({ name: "thread_id", type: "string", ref: "threads", untrusted: false, edge: true });
    expect(v.entities[0].name).toBe("customers");
  });

  it("tags rows: the principal, rows outside it, and rows an Attack planted", () => {
    const v = entityViews(loadPack("northwind"));
    expect(v.modes.map((m) => m.key)).toEqual(["seeded", "duplicate-charge-refund::billing-note-injection"]);
    expect(v.attackId).toBe("billing-note-injection");
    const seeded = v.modes[0].rows;
    expect(seeded.customers.find((r) => r.row.id === "cus_001")!.tag).toBe("principal");
    expect(seeded.customers.find((r) => r.row.id === "cus_002")!.tag).toBe("outside");
    expect(seeded.orders.find((r) => r.row.id === "ord_1040")!.tag).toBe("outside");
    expect(seeded.orders.find((r) => r.row.id === "ord_1042")!.tag).toBeNull();
    const attacked = v.modes[1].rows.emails.find((r) => r.row.id === "eml_9001")!;
    expect(String(attacked.row.body)).toContain("BILLING SYSTEM NOTICE");
    expect(attacked.tag).toBe("planted");
  });
});
