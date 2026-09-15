import { describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import type { EntitySpec } from "@/engine/pack";
import {
  arrowMidpoint,
  arrowPath,
  entityMapLabel,
  layoutEntityMap,
  untrustedFields,
  BOX_H,
  BOX_W,
  COLUMNS,
  COL_PITCH,
  FAN,
  LANE,
  PAD_BOTTOM,
  PAD_RIGHT,
  PAD_X,
  PAD_Y,
  ROW_PITCH,
  type EntityArrow,
  type EntityMapLayout,
} from "@/ui/worlds/entityLayout";

function entity(fields: Record<string, EntitySpec["fields"][string]>, label = "E"): EntitySpec {
  return { label, owner: "self", fields };
}

const str = { type: "string" as const };
const ref = (to: string) => ({ type: "string" as const, ref: to });

/** Six collections in a chain a → b → c → d → e → f, so every grid position is exercised. */
function chain(n: number): Record<string, EntitySpec> {
  const names = ["a", "b", "c", "d", "e", "f", "g"].slice(0, n);
  const entities: Record<string, EntitySpec> = {};
  names.forEach((name, i) => {
    entities[name] = entity(i === 0 ? { id: str } : { id: str, [`${names[i - 1]}_id`]: ref(names[i - 1]) }, name.toUpperCase());
  });
  return entities;
}

const layoutOf = (entities: Record<string, EntitySpec>, rowCounts: Record<string, number> = {}, principal = "a") =>
  layoutEntityMap({ entities, rowCounts, principal });

const boxAt = (layout: EntityMapLayout, collection: string) => layout.boxes.find((b) => b.collection === collection)!;
const arrowFor = (layout: EntityMapLayout, id: string) => layout.arrows.find((a) => a.id === id)!;

describe("layoutEntityMap: grid positions", () => {
  it("places collections across 3 columns in declaration order", () => {
    const layout = layoutOf(chain(7));
    expect(layout.boxes.map((b) => [b.collection, b.col, b.row])).toEqual([
      ["a", 0, 0],
      ["b", 1, 0],
      ["c", 2, 0],
      ["d", 0, 1],
      ["e", 1, 1],
      ["f", 2, 1],
      ["g", 0, 2],
    ]);
  });

  it("derives x/y from the pitch and the margins, with every box the same size", () => {
    const layout = layoutOf(chain(7));
    expect(boxAt(layout, "a")).toMatchObject({ x: PAD_X, y: PAD_Y, w: BOX_W, h: BOX_H });
    expect(boxAt(layout, "c")).toMatchObject({ x: PAD_X + 2 * COL_PITCH, y: PAD_Y });
    expect(boxAt(layout, "d")).toMatchObject({ x: PAD_X, y: PAD_Y + ROW_PITCH });
    expect(boxAt(layout, "g")).toMatchObject({ x: PAD_X, y: PAD_Y + 2 * ROW_PITCH });
  });

  it("never overlaps two boxes", () => {
    const layout = layoutOf(chain(7));
    for (const a of layout.boxes) {
      for (const b of layout.boxes) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.collection} overlaps ${b.collection}`).toBe(true);
      }
    }
  });

  it("sizes the canvas to the columns and rows actually used", () => {
    expect(layoutOf(chain(7))).toMatchObject({
      width: PAD_X + (COLUMNS - 1) * COL_PITCH + BOX_W + PAD_RIGHT,
      height: PAD_Y + 2 * ROW_PITCH + BOX_H + PAD_BOTTOM,
    });
    expect(layoutOf(chain(2))).toMatchObject({
      width: PAD_X + COL_PITCH + BOX_W + PAD_RIGHT,
      height: PAD_Y + BOX_H + PAD_BOTTOM,
    });
  });

  it("survives a pack with no entities at all", () => {
    const layout = layoutOf({});
    expect(layout.boxes).toEqual([]);
    expect(layout.arrows).toEqual([]);
    expect(layout.width).toBe(PAD_X + BOX_W + PAD_RIGHT);
    expect(layout.height).toBe(PAD_Y + BOX_H + PAD_BOTTOM);
  });

  it("is deterministic — the same input lays out identically every time", () => {
    expect(JSON.stringify(layoutOf(chain(7)))).toBe(JSON.stringify(layoutOf(chain(7))));
  });
});

describe("layoutEntityMap: principal and untrusted marking", () => {
  it("marks exactly the principal collection", () => {
    const layout = layoutOf(chain(4), {}, "c");
    expect(layout.boxes.filter((b) => b.principal).map((b) => b.collection)).toEqual(["c"]);
    expect(layout.principal).toBe("c");
  });

  it("marks no box when the principal names a collection that is not in the map", () => {
    expect(layoutOf(chain(3), {}, "nope").boxes.some((b) => b.principal)).toBe(false);
  });

  it("lists untrusted fields per box, in field order", () => {
    const entities = {
      a: entity({ id: str, body: { type: "text", untrusted: true }, subject: str, note: { type: "text", untrusted: true } }),
      b: entity({ id: str, body: { type: "text" } }),
    };
    const layout = layoutOf(entities);
    expect(boxAt(layout, "a").untrusted).toEqual(["body", "note"]);
    expect(boxAt(layout, "b").untrusted).toEqual([]);
    expect(untrustedFields(layout)).toEqual(["a.body", "a.note"]);
  });

  it("reads row counts from the seed, defaulting an absent collection to 0", () => {
    const layout = layoutOf(chain(3), { a: 3, b: 0 });
    expect(layout.boxes.map((b) => b.rows)).toEqual([3, 0, 0]);
  });
});

describe("layoutEntityMap: arrows", () => {
  it("draws one arrow per ref field, from the owner to the target", () => {
    const layout = layoutOf(chain(4));
    expect(layout.arrows.map((a) => [a.from, a.to, a.field])).toEqual([
      ["b", "a", "a_id"],
      ["c", "b", "b_id"],
      ["d", "c", "c_id"],
    ]);
  });

  it("skips self-references and refs to collections that are not in the map", () => {
    const entities = {
      a: entity({ id: str, parent_id: ref("a"), ghost_id: ref("elsewhere"), b_id: ref("b") }),
      b: entity({ id: str }),
    };
    expect(layoutOf(entities).arrows.map((a) => a.id)).toEqual(["a.b_id->b"]);
  });

  it("routes a same-row arrow between facing side faces, at box mid-height", () => {
    const layout = layoutOf(chain(3));
    const a = arrowFor(layout, "b.a_id->a"); // b (col 1) → a (col 0): leftwards
    expect(a).toMatchObject({
      x1: boxAt(layout, "b").x,
      x2: boxAt(layout, "a").x + BOX_W,
      y1: PAD_Y + BOX_H / 2,
      y2: PAD_Y + BOX_H / 2,
    });
    // control on the midpoint = a straight line
    expect(a.cx).toBe((a.x1 + a.x2) / 2);
    expect(a.cy).toBe((a.y1 + a.y2) / 2);
  });

  it("routes a cross-row arrow between the top and bottom faces, at box mid-width", () => {
    const layout = layoutOf(chain(4));
    const a = arrowFor(layout, "d.c_id->c"); // d (col 0, row 1) → c (col 2, row 0): upwards
    expect(a).toMatchObject({
      x1: boxAt(layout, "d").x + BOX_W / 2,
      y1: boxAt(layout, "d").y,
      x2: boxAt(layout, "c").x + BOX_W / 2,
      y2: boxAt(layout, "c").y + BOX_H,
    });
  });

  it("bows a same-column arrow that spans two or more rows out into the left gutter", () => {
    // g (col 0, row 2) → a (col 0, row 0), with d (col 0, row 1) in between.
    const entities = { ...chain(7), g: entity({ id: str, a_id: ref("a") }, "G") };
    const layout = layoutOf(entities);
    const a = arrowFor(layout, "g.a_id->a");
    expect(a).toMatchObject({ x1: PAD_X, x2: PAD_X, cx: PAD_X - 2 * LANE });
    // The apex clears the boxes' left edge by LANE, and stays on the canvas.
    expect(arrowMidpoint(a).x).toBe(PAD_X - LANE);
    expect(a.cx).toBeGreaterThanOrEqual(0);
  });

  it("fans parallel arrows between the same pair apart, centred on the shared face", () => {
    const entities = {
      a: entity({ id: str }),
      b: entity({ id: str, owner_id: ref("a"), backup_id: ref("a") }),
    };
    const layout = layoutOf(entities);
    const [first, second] = layout.arrows;
    expect(second.y1 - first.y1).toBe(FAN);
    expect((first.y1 + second.y1) / 2).toBe(PAD_Y + BOX_H / 2);
  });

  it("gives every arrow a unique, stable id", () => {
    const ids = layoutOf(chain(7)).arrows.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("arrowPath / arrowMidpoint", () => {
  const a: EntityArrow = { id: "x", from: "a", to: "b", field: "f", x1: 0, y1: 0, cx: 10, cy: 20, x2: 40, y2: 40 };

  it("emits a quadratic Bézier through the control point", () => {
    expect(arrowPath(a)).toBe("M 0 0 Q 10 20 40 40");
  });

  it("puts the label at the curve's t = 0.5 point", () => {
    expect(arrowMidpoint(a)).toEqual({ x: (0 + 20 + 40) / 4, y: (0 + 40 + 40) / 4 });
  });
});

describe("entityMapLabel", () => {
  it("states the counts, the principal and every untrusted field", () => {
    const entities = { a: entity({ id: str }), b: entity({ id: str, a_id: ref("a"), body: { type: "text", untrusted: true } }) };
    expect(entityMapLabel(layoutOf(entities))).toBe(
      "Entity map: 2 collections; 1 reference between them; principal collection a; untrusted: b.body.",
    );
  });

  it("says so when nothing is untrusted", () => {
    expect(entityMapLabel(layoutOf(chain(1)))).toBe(
      "Entity map: 1 collection; 0 references between them; principal collection a; no untrusted fields.",
    );
  });
});

describe("layoutEntityMap: the real Northwind pack", () => {
  const pack = loadPack("northwind");
  const rowCounts = Object.fromEntries(Object.entries(pack.seed.rows).map(([c, rows]) => [c, rows.length]));
  const layout = layoutEntityMap({ entities: pack.meta.entities, rowCounts, principal: pack.meta.principal });

  it("draws all seven collections with customers as the principal", () => {
    expect(layout.boxes.map((b) => b.collection)).toEqual(["customers", "orders", "payments", "refunds", "threads", "emails", "tickets"]);
    expect(layout.boxes.filter((b) => b.principal).map((b) => b.collection)).toEqual(["customers"]);
  });

  it("flags emails.body as the pack's only injection surface", () => {
    expect(untrustedFields(layout)).toEqual(["emails.body"]);
  });

  it("shows the empty refunds collection with a zero row count rather than dropping it", () => {
    expect(boxAt(layout, "refunds")).toMatchObject({ rows: 0 });
  });

  it("draws an arrow for each of the seven ref fields", () => {
    expect(layout.arrows.map((a) => a.id)).toEqual([
      "orders.customer_id->customers",
      "payments.order_id->orders",
      "refunds.payment_id->payments",
      "threads.customer_id->customers",
      "emails.thread_id->threads",
      "tickets.customer_id->customers",
      "tickets.thread_id->threads",
    ]);
  });

  it("keeps every arrow inside the canvas", () => {
    for (const a of layout.arrows) {
      for (const [x, y] of [
        [a.x1, a.y1],
        [a.cx, a.cy],
        [a.x2, a.y2],
      ]) {
        expect(x, a.id).toBeGreaterThanOrEqual(0);
        expect(x, a.id).toBeLessThanOrEqual(layout.width);
        expect(y, a.id).toBeGreaterThanOrEqual(0);
        expect(y, a.id).toBeLessThanOrEqual(layout.height);
      }
    }
  });

  it("routes tickets → customers around refunds rather than straight through it", () => {
    const a = arrowFor(layout, "tickets.customer_id->customers");
    expect(a.cx).toBeLessThan(boxAt(layout, "refunds").x);
  });
});
