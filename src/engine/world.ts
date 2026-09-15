// Generic World: seeding, snapshotting, row lookup and `where`-clause matching against a
// WorldPack's declared entities — no domain-specific collection names.
import { collectionOfId, ownerOf } from "./ownership";
import type { WorldPack } from "./pack";
import type { Row, Snapshot, World } from "./types";

/** A fresh World from a pack's seed: every declared entity's collection present, deep-cloned. */
export function seedWorld(pack: WorldPack): World {
  const collections: Record<string, Row[]> = {};
  for (const collection of Object.keys(pack.meta.entities)) {
    collections[collection] = structuredClone(pack.seed.rows[collection] ?? []);
  }
  return { now: pack.seed.now, currency: pack.seed.currency, collections };
}

/** A deep copy of a World, taken at some point in time. */
export function snapshot(w: World): Snapshot {
  return structuredClone(w);
}

/** Rows of a collection; `[]` when the collection is absent. */
export function rowsOf(w: World, collection: string): Row[] {
  return w.collections[collection] ?? [];
}

/** A single row by id, or `undefined` when not found. */
export function findRow(w: World, collection: string, id: string): Row | undefined {
  return rowsOf(w, collection).find((r) => r.id === id);
}

/**
 * Resolves a `where` key against a row: a bare field name, a dotted chain of `ref` hops
 * (`refField.field...`, following each `ref` field to the referenced row before reading the
 * next segment), or `$owner` (the row's principal, via `ownerOf`). `undefined` when any hop
 * can't be followed (missing field, non-ref field, dangling ref, unknown row).
 */
export function resolveWhereKey(pack: WorldPack, w: World, row: Row, key: string): unknown {
  const collection = collectionOfId(pack, row.id);
  if (key === "$owner") return collection ? ownerOf(pack, w, collection, row.id) : null;

  const parts = key.split(".");
  let curCollection = collection;
  let curRow: Row | undefined = row;
  for (let i = 0; i < parts.length; i++) {
    if (!curRow) return undefined;
    const field = parts[i];
    const value = curRow[field];
    if (i === parts.length - 1) return value;
    if (typeof value !== "string") return undefined;
    const refCollection = curCollection ? pack.meta.entities[curCollection]?.fields[field]?.ref : undefined;
    if (!refCollection) return undefined;
    curCollection = refCollection;
    curRow = findRow(w, refCollection, value);
  }
  return undefined;
}

/**
 * Whether every key in `where` matches `row` (JSON equality per key).
 *
 * A `where` value of `undefined` matches **nothing**. It reaches here only from a template that did
 * not resolve — typically an omitted optional tool input — and `JSON.stringify(undefined)` is
 * `undefined` on both sides, so an unresolvable key against an absent value used to match every row
 * in the collection and hand the agent a silently unscoped read. Scoping to nothing is the safe
 * reading of "filter by a value I do not have".
 */
export function matchWhere(pack: WorldPack, w: World, row: Row, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([key, value]) => value !== undefined && JSON.stringify(resolveWhereKey(pack, w, row, key)) === JSON.stringify(value));
}

/** Display label for a collection's entity; falls back to the collection name if undeclared. */
export function entityLabel(pack: WorldPack, collection: string): string {
  return pack.meta.entities[collection]?.label ?? collection;
}
