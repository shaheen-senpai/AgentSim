import { ENTITY_COLLECTIONS, type Email, type EntityCollection, type Refund, type Snapshot } from "./types";
import { fmtMoney } from "./money";

export type DiffEntry = { op: "added" | "changed"; kind: EntityCollection; entityId: string; summary: string };

type Entity = { id: string } & Record<string, unknown>;

export function diffWorld(a: Snapshot, b: Snapshot): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const kind of ENTITY_COLLECTIONS) {
    const before = new Map((a[kind] as Entity[]).map((x) => [x.id, x]));
    for (const item of b[kind] as Entity[]) {
      const prev = before.get(item.id);
      if (!prev) out.push({ op: "added", kind, entityId: item.id, summary: summarizeAdded(b, kind, item) });
      else if (JSON.stringify(prev) !== JSON.stringify(item))
        out.push({ op: "changed", kind, entityId: item.id, summary: summarizeChanged(prev, item) });
    }
  }
  return out;
}

export function unchangedCount(a: Snapshot, b: Snapshot): number {
  const total = ENTITY_COLLECTIONS.reduce((n, kind) => n + (b[kind] as Entity[]).length, 0);
  return total - diffWorld(a, b).length;
}

function summarizeAdded(w: Snapshot, kind: EntityCollection, item: Entity): string {
  switch (kind) {
    case "refunds": {
      const r = item as unknown as Refund;
      const p = w.payments.find((p) => p.id === r.payment_id);
      return `Refund ${fmtMoney(r.amount, w.currency)} on ${r.payment_id}${p ? ` (${p.order_id})` : ""}`;
    }
    case "emails": {
      const e = item as unknown as Email;
      return `Email ${e.from.split("@")[0]} → ${e.to}`;
    }
    default:
      return `${kind.slice(0, -1)} added`;
  }
}

function summarizeChanged(prev: Entity, next: Entity): string {
  const parts: string[] = [];
  for (const key of Object.keys(next)) {
    if (JSON.stringify(prev[key]) === JSON.stringify(next[key])) continue;
    const p = prev[key], n = next[key];
    parts.push(Array.isArray(n) ? `${key} ${(p as unknown[]).length} → ${n.length}` : `${key} ${String(p)} → ${String(n)}`);
  }
  return parts.join(" · ");
}
