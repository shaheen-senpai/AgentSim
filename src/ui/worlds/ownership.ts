// The ownership graph as the Entities tab draws it (design/agentsim-console.html `erdSvg`
// 1473-1527): the chain from a collection to the principal, and a column-per-depth layout.
// Pure and browser-safe — type-only engine imports; `tests/ui/ownership.test.ts`.
import type { EntitySpec } from "@/engine/pack";

/**
 * `["refunds", "payments", "orders", "customers"]`: `owner.via` → that field's `ref`, hop by hop,
 * until a self-owned collection. Stops at a missing hop or a repeat, so a malformed pack cannot
 * loop; the load-time validator is what actually rejects one.
 */
export function ownershipChain(entities: Record<string, EntitySpec>, name: string): string[] {
  const chain = [name];
  let spec = entities[name];
  while (spec && spec.owner !== "self" && chain.length <= Object.keys(entities).length) {
    const next = spec.fields[spec.owner.via]?.ref;
    if (!next || !entities[next] || chain.includes(next)) break;
    chain.push(next);
    spec = entities[next];
  }
  return chain;
}

/** The field a collection is owned through, or `—` for the principal itself. */
export function ownedVia(entities: Record<string, EntitySpec>, name: string): string {
  const spec = entities[name];
  return spec && spec.owner !== "self" ? spec.owner.via : "—";
}

export const ERD = { NW: 176, NH: 64, GAPX: 92, GAPY: 16, PAD: 14 } as const;

export type ErdNode = { name: string; x: number; y: number; depth: number; root: boolean };
export type ErdEdge = { from: string; to: string; via: string; x1: number; y1: number; x2: number; y2: number; mx: number };
export type ErdLayout = { width: number; height: number; nodes: ErdNode[]; edges: ErdEdge[] };

/** Columns are depth in the ownership chain (the principal at 0), each column vertically centred. */
export function erdLayout(entities: Record<string, EntitySpec>): ErdLayout {
  const { NW, NH, GAPX, GAPY, PAD } = ERD;
  const names = Object.keys(entities);
  const chains = new Map(names.map((n) => [n, ownershipChain(entities, n)]));
  const byDepth: string[][] = [];
  for (const n of names) (byDepth[chains.get(n)!.length - 1] ??= []).push(n);
  const cols = byDepth.length;
  const rows = byDepth.reduce((m, c) => Math.max(m, c?.length ?? 0), 0);
  const width = PAD * 2 + cols * NW + Math.max(0, cols - 1) * GAPX;
  const height = PAD * 2 + rows * NH + Math.max(0, rows - 1) * GAPY;

  const pos = new Map<string, { x: number; y: number }>();
  byDepth.forEach((col, d) => {
    if (!col) return;
    const colH = col.length * NH + (col.length - 1) * GAPY;
    const top = PAD + (height - PAD * 2 - colH) / 2;
    col.forEach((n, i) => pos.set(n, { x: PAD + d * (NW + GAPX), y: top + i * (NH + GAPY) }));
  });

  const nodes: ErdNode[] = names.map((n) => ({ name: n, ...pos.get(n)!, depth: chains.get(n)!.length - 1, root: entities[n].owner === "self" }));
  const edges: ErdEdge[] = names
    .filter((n) => chains.get(n)!.length >= 2)
    .map((n) => {
      const parent = chains.get(n)![1];
      const a = pos.get(parent)!, b = pos.get(n)!;
      const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x - 7, y2 = b.y + NH / 2;
      return { from: n, to: parent, via: ownedVia(entities, n), x1, y1, x2, y2, mx: (x1 + x2) / 2 };
    });
  return { width, height, nodes, edges };
}
