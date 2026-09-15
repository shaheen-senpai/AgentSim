// Geometry for the Worlds overview entity map (spec §6.2). Pure and deterministic: no React, no
// DOM, no randomness — the same pack always lays out to the same numbers, so the SVG a server
// component renders is byte-stable and the whole thing is unit-testable without a DOM
// (`tests/ui/entityLayout.test.ts`). `EntityMap.tsx` does nothing but draw what this returns.
//
// Layout: one box per collection on a 3-column grid in `pack.yaml` declaration order. Arrows run
// from the collection that owns a `ref` field to the collection the field points at, labelled with
// the field name — i.e. the direction you *follow* to resolve ownership, which is also the
// direction `owner: { via: … }` walks toward the principal.
//
// Every arrow is a quadratic Bézier (`M x1 y1 Q cx cy x2 y2`); a "straight" arrow is one whose
// control point sits on the midpoint. Three routes, chosen purely by grid position:
//
//   same row                 → left/right faces, straight across the column gutter
//   same column, >= 2 apart  → both left faces, bowed out into the gutter to the left, so the
//                              arrow visibly goes *around* the box(es) in between
//   anything else            → top/bottom faces, straight; the 40 px row gutter is deep enough
//                              that a diagonal passes under the boxes of the row above
//
// Parallel arrows between the same ordered pair fan apart along their shared face by `FAN`.
import type { EntitySpec } from "@/engine/pack";

export const BOX_W = 200;
export const BOX_H = 56;
export const COL_PITCH = 260;
export const ROW_PITCH = 96;
export const COLUMNS = 3;

/** Left margin: wide enough for a same-column arrow's bow (`2 x LANE`) to stay on the canvas. */
export const PAD_X = 72;
export const PAD_Y = 28;
export const PAD_RIGHT = 24;
/** Bottom margin leaves room for the red `untrusted` field list under the last row of boxes. */
export const PAD_BOTTOM = 44;

/** How far a same-column long arrow's apex sits to the left of its boxes. */
export const LANE = 32;
/** Gap between parallel arrows that join the same ordered pair of collections. */
export const FAN = 20;

export type EntityBox = {
  collection: string;
  label: string;
  rows: number;
  /** The principal collection — every row in the World resolves to one of its rows. */
  principal: boolean;
  /** Field names marked `untrusted: true` — the pack's injection surfaces. */
  untrusted: string[];
  col: number;
  row: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type EntityArrow = {
  id: string;
  from: string;
  to: string;
  field: string;
  x1: number;
  y1: number;
  cx: number;
  cy: number;
  x2: number;
  y2: number;
};

export type EntityMapLayout = {
  boxes: EntityBox[];
  arrows: EntityArrow[];
  width: number;
  height: number;
  principal: string;
};

export type EntityMapInput = {
  entities: Record<string, EntitySpec>;
  /** Seed row count per collection; a collection absent from the seed counts as 0. */
  rowCounts: Record<string, number>;
  principal: string;
};

type Ref = { from: string; to: string; field: string };

/** Every `ref` field, in declaration order, skipping self-references and refs to unknown collections. */
function refsOf(entities: Record<string, EntitySpec>): Ref[] {
  const refs: Ref[] = [];
  for (const [from, spec] of Object.entries(entities)) {
    for (const [field, f] of Object.entries(spec.fields)) {
      // A dangling ref is a load-time validation error; drawing the map must never be the thing
      // that throws, so an unknown target is simply not drawn.
      if (!f.ref || f.ref === from || !(f.ref in entities)) continue;
      refs.push({ from, to: f.ref, field });
    }
  }
  return refs;
}

function boxesOf(input: EntityMapInput): EntityBox[] {
  return Object.entries(input.entities).map(([collection, spec], i) => {
    const col = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    return {
      collection,
      label: spec.label,
      rows: input.rowCounts[collection] ?? 0,
      principal: collection === input.principal,
      untrusted: Object.entries(spec.fields).filter(([, f]) => f.untrusted === true).map(([name]) => name),
      col,
      row,
      x: PAD_X + col * COL_PITCH,
      y: PAD_Y + row * ROW_PITCH,
      w: BOX_W,
      h: BOX_H,
    };
  });
}

type Geometry = Omit<EntityArrow, "id" | "from" | "to" | "field">;

function route(a: EntityBox, b: EntityBox, spread: number): Geometry {
  const dRow = b.row - a.row;
  const dCol = b.col - a.col;

  if (dRow === 0) {
    // Side by side: straight across the column gutter, out of the face that points at the target.
    const x1 = dCol > 0 ? a.x + a.w : a.x;
    const x2 = dCol > 0 ? b.x : b.x + b.w;
    const y1 = a.y + a.h / 2 + spread;
    const y2 = b.y + b.h / 2 + spread;
    return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  }

  if (dCol === 0 && Math.abs(dRow) >= 2) {
    // Same column, boxes in between: leave both left faces and bow out into the left gutter.
    const x1 = a.x;
    const x2 = b.x;
    const y1 = a.y + a.h / 2 + spread;
    const y2 = b.y + b.h / 2 + spread;
    return { x1, y1, x2, y2, cx: a.x - 2 * LANE, cy: (y1 + y2) / 2 };
  }

  // Different row: straight between the horizontal faces that point at each other.
  const y1 = dRow > 0 ? a.y + a.h : a.y;
  const y2 = dRow > 0 ? b.y : b.y + b.h;
  const x1 = a.x + a.w / 2 + spread;
  const x2 = b.x + b.w / 2 + spread;
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
}

/** Boxes, arrows and canvas size for a pack's entity model. Deterministic for a given pack. */
export function layoutEntityMap(input: EntityMapInput): EntityMapLayout {
  const boxes = boxesOf(input);
  const byName = new Map(boxes.map((b) => [b.collection, b]));

  const refs = refsOf(input.entities);
  const groups = new Map<string, Ref[]>();
  for (const r of refs) {
    const key = JSON.stringify([r.from, r.to]);
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }

  const arrows: EntityArrow[] = refs.map((r) => {
    const group = groups.get(JSON.stringify([r.from, r.to]))!;
    const k = group.indexOf(r);
    const spread = (k - (group.length - 1) / 2) * FAN;
    return { id: `${r.from}.${r.field}->${r.to}`, ...r, ...route(byName.get(r.from)!, byName.get(r.to)!, spread) };
  });

  const cols = Math.max(1, Math.min(COLUMNS, boxes.length));
  const rows = Math.max(1, Math.ceil(boxes.length / COLUMNS));
  return {
    boxes,
    arrows,
    width: PAD_X + (cols - 1) * COL_PITCH + BOX_W + PAD_RIGHT,
    height: PAD_Y + (rows - 1) * ROW_PITCH + BOX_H + PAD_BOTTOM,
    principal: input.principal,
  };
}

/** The `d` attribute for an arrow. */
export function arrowPath(a: EntityArrow): string {
  return `M ${a.x1} ${a.y1} Q ${a.cx} ${a.cy} ${a.x2} ${a.y2}`;
}

/** The curve's midpoint (t = 0.5) — where the field-name label sits. */
export function arrowMidpoint(a: EntityArrow): { x: number; y: number } {
  return { x: (a.x1 + 2 * a.cx + a.x2) / 4, y: (a.y1 + 2 * a.cy + a.y2) / 4 };
}

/** `collection.field` for every untrusted field in the map, in layout order. */
export function untrustedFields(layout: EntityMapLayout): string[] {
  return layout.boxes.flatMap((b) => b.untrusted.map((f) => `${b.collection}.${f}`));
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

/** The SVG's `aria-label` — the same facts the map draws, as one sentence. */
export function entityMapLabel(layout: EntityMapLayout): string {
  const untrusted = untrustedFields(layout);
  return [
    `Entity map: ${plural(layout.boxes.length, "collection")}`,
    `${plural(layout.arrows.length, "reference")} between them`,
    `principal collection ${layout.principal}`,
    untrusted.length > 0 ? `untrusted: ${untrusted.join(", ")}` : "no untrusted fields",
  ].join("; ") + ".";
}
