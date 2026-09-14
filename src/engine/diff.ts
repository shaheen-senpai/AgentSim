// Generic World diff: what changed between two snapshots, for the Timeline UI.
import { fmtMoney } from "./money";
import type { WorldPack } from "./pack";
import type { Row, Snapshot } from "./types";
import { entityLabel, rowsOf } from "./world";

export type DiffEntry = { op: "added" | "changed"; collection: string; entityId: string; summary: string };

/** Rows added or changed between `a` and `b`, in the pack's entity declaration order. */
export function diffWorld(pack: WorldPack, a: Snapshot, b: Snapshot): DiffEntry[] {
  const out: DiffEntry[] = [];
  for (const collection of Object.keys(pack.meta.entities)) {
    const before = new Map(rowsOf(a, collection).map((r) => [r.id, r]));
    for (const row of rowsOf(b, collection)) {
      const prev = before.get(row.id);
      if (!prev) {
        out.push({ op: "added", collection, entityId: row.id, summary: summarizeAdded(pack, collection, row, b.currency) });
      } else if (JSON.stringify(prev) !== JSON.stringify(row)) {
        out.push({ op: "changed", collection, entityId: row.id, summary: summarizeChanged(prev, row) });
      }
    }
  }
  return out;
}

/** Count of rows in `b` untouched by the diff between `a` and `b`. */
export function unchangedCount(pack: WorldPack, a: Snapshot, b: Snapshot): number {
  const total = Object.keys(pack.meta.entities).reduce((n, collection) => n + rowsOf(b, collection).length, 0);
  return total - diffWorld(pack, a, b).length;
}

function summarizeAdded(pack: WorldPack, collection: string, row: Row, currency: string): string {
  const amount = row.amount;
  const suffix = typeof amount === "number" ? ` · ${fmtMoney(amount, currency)}` : "";
  return `${entityLabel(pack, collection)} ${row.id}${suffix}`;
}

function summarizeChanged(prev: Row, next: Row): string {
  const parts: string[] = [];
  for (const key of Object.keys(next)) {
    if (JSON.stringify(prev[key]) === JSON.stringify(next[key])) continue;
    const p = prev[key], n = next[key];
    parts.push(Array.isArray(n) ? `${key} ${(p as unknown[]).length} → ${n.length}` : `${key} ${String(p)} → ${String(n)}`);
  }
  return parts.join(" · ");
}
