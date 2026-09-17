// What the Entities tab shows, computed server-side with the engine's own `seedWorld` and
// `applyAttack` — the exact functions a Run calls before its start Snapshot — and `ownerOf` for the
// row tags. The client island only renders this.
import { applyAttack } from "@/engine/attack";
import { ownerOf } from "@/engine/ownership";
import type { EntitySpec, WorldPack } from "@/engine/pack";
import type { Row, World } from "@/engine/types";
import { seedWorld } from "@/engine/world";
import { ownedVia, ownershipChain } from "@/ui/worlds/ownership";
import { attackOptions } from "@/ui/worlds/packView";

export type FieldView = { name: string; type: string; ref: string | null; untrusted: boolean; edge: boolean };
/** `planted`: an Attack wrote this row · `principal`: the row the pack's data-access Check names · `outside`: another principal's. */
export type RowTag = "planted" | "principal" | "outside" | null;
export type RowView = { row: Row; tag: RowTag };
export type SeedModeView = { key: string; label: string; rows: Record<string, RowView[]> };
export type EntityView = {
  name: string;
  label: string;
  prefix: string;
  ownedVia: string;
  chain: string[];
  untrusted: string | null;
  /** Has a `text` field — shown as record cards rather than a table. */
  hasText: boolean;
  fields: FieldView[];
};

function fieldViews(spec: EntitySpec): FieldView[] {
  const via = spec.owner === "self" ? null : spec.owner.via;
  return Object.entries(spec.fields).map(([name, f]) => ({ name, type: f.type, ref: f.ref ?? null, untrusted: f.untrusted === true, edge: name === via }));
}

/** The principal the pack's first `reads_scoped` Check names — what "the principal" and "outside" mean on this tab. */
function scopedPrincipal(pack: WorldPack): string | null {
  for (const s of pack.scenarios) for (const c of s.checks) if (c.type === "reads_scoped") return c.principal;
  return null;
}

function tagRows(pack: WorldPack, world: World, seeded: Record<string, Row[]> | null, principal: string | null): Record<string, RowView[]> {
  const out: Record<string, RowView[]> = {};
  for (const [collection, rows] of Object.entries(world.collections)) {
    const seededById = new Map((seeded?.[collection] ?? []).map((r) => [r.id, JSON.stringify(r)]));
    out[collection] = rows.map((row) => {
      // A row the seed did not have, or one whose fields differ from the seed's copy, is the Attack's work.
      if (seeded !== null && seededById.get(row.id) !== JSON.stringify(row)) return { row, tag: "planted" };
      if (!principal) return { row, tag: null };
      const owner = ownerOf(pack, world, collection, row.id);
      if (owner === principal) return { row, tag: collection === pack.meta.principal ? "principal" : null };
      return { row, tag: owner === null ? null : "outside" };
    });
  }
  return out;
}

export function entityViews(pack: WorldPack): { entities: EntityView[]; modes: SeedModeView[]; attackId: string | null } {
  const principal = scopedPrincipal(pack);
  const base = seedWorld(pack);
  const modes: SeedModeView[] = [{ key: "seeded", label: "as seeded", rows: tagRows(pack, base, null, principal) }];
  const options = attackOptions(pack.scenarios);
  for (const opt of options) {
    try {
      const world = seedWorld(pack);
      applyAttack(pack, world, opt.attack);
      modes.push({ key: opt.key, label: opt.attack.id, rows: tagRows(pack, world, base.collections, principal) });
    } catch {
      // A malformed Attack (pack validation does not fully cover insert_row rows) is skipped; the seeded view still renders.
    }
  }
  const entities: EntityView[] = Object.entries(pack.meta.entities).map(([name, spec]) => {
    const fields = fieldViews(spec);
    return {
      name,
      label: spec.label,
      prefix: spec.id_prefix ?? "—",
      ownedVia: ownedVia(pack.meta.entities, name),
      chain: ownershipChain(pack.meta.entities, name),
      untrusted: fields.find((f) => f.untrusted)?.name ?? null,
      hasText: Object.values(spec.fields).some((f) => f.type === "text"),
      fields,
    };
  });
  return { entities, modes, attackId: options[0]?.attack.id ?? null };
}
