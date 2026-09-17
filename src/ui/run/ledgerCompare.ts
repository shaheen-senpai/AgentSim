// The Run page's ledger comparison, as data. A Run has three World ledgers: the pack's **Seed**
// (recomputed on the server — it is not on the record), the **start** Snapshot the Attack left
// (`run.startSnapshot`), and the **end** Snapshot the agent left (`run.endSnapshot`). Any two are
// compared row by row and field by field here; the panel only renders the result.
//
// Three things are marked so the reader can see where the Attack got in and whether it landed:
//   • the field the Attack injected into (or the row it forged),
//   • the rows a violating Event wrote — the same rule as the World-diff card (`flaggedEntityIds`),
//   • the rows the Event that took the Lure wrote — the same rule as the flow view (`matchesLure`).
//
// Pure, browser-safe: only `import type` and the leaf `@/engine/lure`. `tests/ui/ledgerCompare.test.ts`.
import { matchesLure } from "@/engine/lure";
import type { Row, Snapshot } from "@/engine/types";
import type { RunRecord } from "@/runner/store";
import { flaggedEntityIds } from "./eventFlags";

export type LedgerKey = "seed" | "start" | "end";
export type Ledgers = { seed: Snapshot | null; start: Snapshot; end: Snapshot | null };

export type CompareMode = { key: string; from: LedgerKey; to: LedgerKey; label: string; hint: string };

export const COMPARE_MODES: readonly CompareMode[] = [
  { key: "seed-start", from: "seed", to: "start", label: "Seed → Start", hint: "What the Attack planted before the agent saw the World" },
  { key: "start-end", from: "start", to: "end", label: "Start → End", hint: "What the agent changed during the Run" },
  { key: "seed-end", from: "seed", to: "end", label: "Seed → End", hint: "Net change from the pack's Seed to the Run's end" },
];

/** The modes whose two ledgers both exist — no Seed when the pack is gone, no end while the Run is running. */
export function availableModes(ledgers: Ledgers): CompareMode[] {
  return COMPARE_MODES.filter((m) => ledgers[m.from] !== null && ledgers[m.to] !== null);
}

export function modeLedgers(mode: CompareMode, ledgers: Ledgers): { from: Snapshot; to: Snapshot } {
  const from = ledgers[mode.from], to = ledgers[mode.to];
  if (!from || !to) throw new Error(`Ledger comparison ${mode.key}: a ledger is missing`);
  return { from, to };
}

/** Where the Attack wrote. `field` is null for a forged row — the whole row is the injection. */
export type InjectionPoint = { collection: string; id: string; field: string | null };

export type LedgerMarks = { injected: InjectionPoint | null; violationIds: Set<string>; lureIds: Set<string> };

export function ledgerMarks(run: Pick<RunRecord, "attack" | "events" | "violations">): LedgerMarks {
  const m = run.attack?.mutation;
  const injected: InjectionPoint | null = !m ? null : m.type === "insert_row" ? { collection: m.collection, id: m.row.id, field: null } : { collection: m.collection, id: m.id, field: m.field };
  const lure = run.attack?.lure;
  const lureIds = new Set(lure ? run.events.filter((e) => matchesLure(lure, e)).flatMap((e) => e.changes.map((c) => c.id)) : []);
  return { injected, violationIds: flaggedEntityIds(run), lureIds };
}

export type CellDiff = { field: string; before: unknown; after: unknown; changed: boolean; injected: boolean };
export type RowStatus = "added" | "removed" | "changed" | "unchanged";
export type RowMarks = { injected: boolean; violation: boolean; lure: boolean };
export type RowCompare = { id: string; status: RowStatus; marks: RowMarks; cells: CellDiff[] };
export type Counts = Record<RowStatus, number>;
export type CollectionCompare = { collection: string; label: string; rows: RowCompare[]; counts: Counts };

export type EntityRef = { name: string; label: string };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** `id` first, then the union of both rows' fields in first-seen order. */
function fieldOrder(before: Row | undefined, after: Row | undefined): string[] {
  const seen = new Set<string>(["id"]);
  for (const row of [before, after]) for (const key of Object.keys(row ?? {})) seen.add(key);
  return [...seen];
}

function compareRow(id: string, before: Row | undefined, after: Row | undefined, collection: string, marks: LedgerMarks): RowCompare {
  const inj = marks.injected && marks.injected.collection === collection && marks.injected.id === id ? marks.injected : null;
  const cells: CellDiff[] = fieldOrder(before, after).map((field) => {
    const b = before?.[field], a = after?.[field];
    return { field, before: b, after: a, changed: !same(b, a), injected: inj !== null && (inj.field === null || inj.field === field) };
  });
  const status: RowStatus = !before ? "added" : !after ? "removed" : cells.some((c) => c.changed) ? "changed" : "unchanged";
  return { id, status, cells, marks: { injected: inj !== null, violation: marks.violationIds.has(id), lure: marks.lureIds.has(id) } };
}

/**
 * Every collection the pack declares (in declaration order; falling back to the snapshots' own
 * collections when the pack is unknown), each with every row present in either ledger.
 */
export function compareLedgers(entities: readonly EntityRef[], from: Snapshot, to: Snapshot, marks: LedgerMarks): CollectionCompare[] {
  const names: EntityRef[] = entities.length > 0 ? [...entities] : [...new Set([...Object.keys(from.collections), ...Object.keys(to.collections)])].map((name) => ({ name, label: name }));
  return names.map(({ name, label }) => {
    const before = new Map((from.collections[name] ?? []).map((r) => [r.id, r]));
    const after = new Map((to.collections[name] ?? []).map((r) => [r.id, r]));
    const ids = [...new Set([...before.keys(), ...after.keys()])];
    const rows = ids.map((id) => compareRow(id, before.get(id), after.get(id), name, marks));
    const counts: Counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
    for (const r of rows) counts[r.status]++;
    return { collection: name, label, rows, counts };
  });
}

/** A marked row is always worth seeing, whether or not this mode changed it. */
export const isMarked = (r: RowCompare): boolean => r.marks.injected || r.marks.violation || r.marks.lure;

export function visibleRows(rows: readonly RowCompare[], changedOnly: boolean): RowCompare[] {
  return changedOnly ? rows.filter((r) => r.status !== "unchanged" || isMarked(r)) : [...rows];
}

/** The one-line tally above the tables: rows added / changed / removed, and how many are marked. */
export function compareSummary(collections: readonly CollectionCompare[]): { added: number; changed: number; removed: number; unchanged: number; marked: number } {
  const out = { added: 0, changed: 0, removed: 0, unchanged: 0, marked: 0 };
  for (const c of collections) {
    out.added += c.counts.added;
    out.changed += c.counts.changed;
    out.removed += c.counts.removed;
    out.unchanged += c.counts.unchanged;
    out.marked += c.rows.filter(isMarked).length;
  }
  return out;
}
