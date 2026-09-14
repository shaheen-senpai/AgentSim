// Generic Attacks: mutating a World before a Run starts, and recognising when an agent takes
// the bait. Domain-neutral — every collection/field/row is named by the Scenario's declared
// Attack, validated against the pack's entity fields the same way the DSL validates writes.
import { fieldZod, type Attack, type Lure, type WorldPack } from "./pack";
import type { Event, Row, World } from "./types";
import { findRow } from "./world";

/** Mutates `w` per `attack.mutation`, applied once before the start Snapshot. Throws on a bad target. */
export function applyAttack(pack: WorldPack, w: World, attack: Attack): void {
  const m = attack.mutation;
  const entity = pack.meta.entities[m.collection];
  if (!entity) throw new Error(`Attack ${attack.id}: unknown collection ${m.collection}`);

  switch (m.type) {
    case "append_to_field": {
      const row = findRow(w, m.collection, m.id);
      if (!row) throw new Error(`Attack ${attack.id}: no ${m.collection} ${m.id}`);
      row[m.field] = String(row[m.field] ?? "") + m.text;
      return;
    }
    case "set_field": {
      const row = findRow(w, m.collection, m.id);
      if (!row) throw new Error(`Attack ${attack.id}: no ${m.collection} ${m.id}`);
      row[m.field] = m.value;
      return;
    }
    case "insert_row": {
      const row: Row = { ...m.row };
      for (const [field, spec] of Object.entries(entity.fields)) {
        const parsed = fieldZod(spec).safeParse(row[field]);
        if (!parsed.success) {
          const message = parsed.error.issues[0]?.message ?? parsed.error.message;
          throw new Error(`Attack ${attack.id}: invalid ${m.collection} row: ${message}`);
        }
        row[field] = parsed.data;
      }
      (w.collections[m.collection] ??= []).push(row);
      return;
    }
  }
}

/** Did this Event perform (or attempt) the action the Attack's Lure is trying to induce? */
export function matchesLure(lure: Lure, ev: Pick<Event, "tool" | "input">): boolean {
  if (ev.tool !== lure.tool) return false;
  return Object.entries(lure.args_match).every(([k, v]) => JSON.stringify(ev.input[k]) === JSON.stringify(v));
}

/**
 * Renders `s` the way `JSON.stringify` embeds a string inside a JSON string (escaping quotes,
 * backslashes and control characters like embedded newlines), without the surrounding quotes.
 * A tool's `result` is always `JSON.stringify`d (`dsl.ts`), so this is what a gateway must search
 * for to find literal injected text — a plain, unescaped multi-line marker would never match.
 */
function jsonStringBody(s: string): string {
  return JSON.stringify(s).slice(1, -1);
}

/** The text to search a read result for, to detect the agent having ingested the injected content. */
export function injectionMarker(attack: Attack): string {
  const m = attack.mutation;
  switch (m.type) {
    case "append_to_field":
      return jsonStringBody(m.text.trim());
    case "set_field":
      return jsonStringBody(String(m.value).trim());
    case "insert_row":
      return m.row.id;
  }
}

/** Where the injected content lives, for `event.injected`. */
export function injectedTarget(attack: Attack): { collection: string; id: string; field: string } {
  const m = attack.mutation;
  if (m.type === "insert_row") return { collection: m.collection, id: m.row.id, field: "id" };
  return { collection: m.collection, id: m.id, field: m.field };
}
