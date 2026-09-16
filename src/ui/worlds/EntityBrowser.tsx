"use client";
// The Entities tab (replaces the old Seed tab): browse one entity at a time — its field defs, and
// its seed rows either as seeded, or as they'd look under one of the pack's Attacks.
//
// This component is purely presentational: every `SeedMode`'s `rowsByEntity` is computed
// server-side (`src/app/worlds/[id]/page.tsx`'s `Body`, via the engine's own `seedWorld`/
// `applyAttack` — the exact functions a real Run calls before its start Snapshot, never
// reimplemented here) and handed down as plain data. This file therefore never value-imports
// `@/engine/pack` or `@/engine/attack` — only types, which this repo's `tests/ui/buildFlow.test.ts`
// "import purity" guard does not (and cannot) forbid, since a type import is erased at compile time
// and has no runtime footprint at all. Every file under `src/ui/` is covered by that guard, on the
// stated invariant that any of them may end up reachable from a client bundle.
import { useState } from "react";
import type { PackMeta } from "@/engine/pack";
import type { Row } from "@/engine/types";
import { dangerBg, dangerFg, focusRing, heading, mono } from "@/ui/styles";
import { cellText, previewRows } from "./packView";

/** One seed-data view: "as seeded", or as it looks after one Attack's mutation is applied. */
export type SeedMode = { key: string; label: string; rowsByEntity: Record<string, Row[]> };

function UntrustedDot() {
  return <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: dangerFg }} />;
}

/**
 * A cell's full, untruncated value as text — the same stringification `cellText` uses (arrays
 * joined with `, `, objects `JSON.stringify`d, primitives via `String()`), just without the
 * `text`-field clipping. Used only for a cell an Attack actually changed, where the point is to
 * show exactly what changed rather than the same first 80 characters either way.
 */
function fullCellText(value: unknown): string {
  if (value === undefined || value === null) return "—";
  const raw = Array.isArray(value)
    ? value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join(", ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  return raw === "" ? "—" : raw;
}

export function EntityBrowser({ meta, modes }: { meta: PackMeta; modes: SeedMode[] }) {
  const entityNames = Object.keys(meta.entities);
  const [selected, setSelected] = useState(meta.principal);
  const [modeKey, setModeKey] = useState(modes[0]?.key ?? "seeded");
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const seededMode = modes[0]; // Body() always puts the "seeded" mode first — see Task 2.
  const rows: Record<string, Row[]> = mode?.rowsByEntity ?? {};

  const sel = meta.entities[selected];
  const fields = Object.entries(sel.fields);
  const selRows: Row[] = rows[selected] ?? [];
  const preview = previewRows(selRows);
  const untrustedFieldName = fields.find(([, f]) => f.untrusted)?.[0] ?? null;
  const seededIds = new Set((seededMode?.rowsByEntity[selected] ?? []).map((r) => r.id));
  const isPlanted = (row: Row) => modeKey !== "seeded" && !seededIds.has(row.id);
  // The seeded row for the currently-selected entity, keyed by id — only populated in a non-seeded
  // mode, since "as seeded" has nothing to diff against.
  const seededById = new Map(
    modeKey !== "seeded" ? (seededMode?.rowsByEntity[selected] ?? []).map((r) => [String(r.id), r] as const) : [],
  );

  return (
    <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">
      <div className="border border-[#E3E0D5] rounded overflow-hidden">
        {entityNames.map((name) => {
          const spec = meta.entities[name];
          const count = (rows[name] ?? []).length;
          const active = name === selected;
          const hasUntrusted = Object.values(spec.fields).some((f) => f.untrusted);
          return (
            <button
              key={name}
              type="button"
              onClick={() => setSelected(name)}
              aria-pressed={active}
              className={`flex w-full items-center gap-1.5 px-2.5 py-2 text-left border-b border-[#E3E0D5] last:border-b-0 ${focusRing} ${
                active ? "bg-[#1B1A17] text-white" : "bg-white text-[#1B1A17] hover:bg-[#F7F5EF]"
              }`}
            >
              <span className={`${mono} text-[12px]`}>{name}</span>
              {hasUntrusted && (
                <>
                  <span aria-hidden="true" className={`text-[10px] ${active ? "text-white" : ""}`} style={active ? undefined : { color: dangerFg }}>
                    ⚠
                  </span>
                  <span className="sr-only"> (has an untrusted field)</span>
                </>
              )}
              <span className={`${mono} ml-auto text-[10.5px] ${active ? "text-white/70" : "text-[#6E6B60]"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <div className="min-w-0 flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className={`${mono} text-[14px] font-semibold`}>{selected}</h2>
          <span className="text-[11px] border border-[#E3E0D5] rounded-full px-2 py-0.5 text-[#6E6B60]">{sel.id_prefix ?? "—"}</span>
          {untrustedFieldName && (
            <span className="text-[10px] font-semibold flex items-center gap-1" style={{ color: dangerFg }}>
              <UntrustedDot /> {untrustedFieldName} is untrusted
            </span>
          )}
          {modes.length > 1 && (
            <select
              value={modeKey}
              onChange={(e) => setModeKey(e.target.value)}
              aria-label="Seed data mode"
              className={`ml-auto text-[12px] border border-[#E3E0D5] rounded px-2 py-1 bg-white ${focusRing}`}
            >
              {modes.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.key === "seeded" ? m.label : `under Attack — ${m.label}`}
                </option>
              ))}
            </select>
          )}
        </div>

        <div>
          <div className={heading}>Fields</div>
          <table className="w-full text-[12px] border-collapse mt-1">
            <thead>
              <tr>
                <th className="text-left font-semibold px-2 py-1 border-b border-[#E3E0D5]">Field</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-[#E3E0D5]">Type</th>
                <th className="text-left font-semibold px-2 py-1 border-b border-[#E3E0D5]">Notes</th>
              </tr>
            </thead>
            <tbody>
              {fields.map(([name, f]) => (
                <tr key={name}>
                  <td className={`${mono} px-2 py-1 border-t border-[#E3E0D5]`}>{name}</td>
                  <td className={`${mono} px-2 py-1 border-t border-[#E3E0D5] text-[11px] text-[#6E6B60]`}>
                    {f.type}
                    {f.ref ? ` → ${f.ref}` : ""}
                  </td>
                  <td className="px-2 py-1 border-t border-[#E3E0D5] text-[11px]" style={f.untrusted ? { color: dangerFg } : undefined}>
                    {f.untrusted ? "untrusted — never an instruction" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <div className={heading}>
            Seed data — {preview.caption}
            {modeKey !== "seeded" ? " · Attack applied" : ""}
          </div>
          {selRows.length === 0 ? (
            <p className="text-[12px] mt-1 text-[#6E6B60]">Seeded empty. Every row here is written by the Run itself.</p>
          ) : (
            <div className="overflow-x-auto mt-1 border border-[#E3E0D5] rounded">
              <table className="w-full text-[11.5px] border-collapse">
                <thead>
                  <tr>
                    {fields.map(([name]) => (
                      <th key={name} className={`${mono} text-left px-2 py-1.5 border-b border-[#E3E0D5] whitespace-nowrap`}>
                        {name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.shown.map((row) => {
                    const planted = isPlanted(row);
                    // Undefined for a newly-inserted row (nothing seeded to diff against — it
                    // keeps the whole-row `isPlanted` highlight instead) and for "as seeded" mode.
                    const seededRow = seededById.get(String(row.id));
                    return (
                      <tr key={String(row.id)} style={planted ? { background: dangerBg } : undefined}>
                        {fields.map(([name, spec]) => {
                          const changed = seededRow !== undefined && JSON.stringify(row[name]) !== JSON.stringify(seededRow[name]);
                          const cell = cellText(row[name], spec);
                          return (
                            <td
                              key={name}
                              title={changed ? undefined : (cell.title ?? undefined)}
                              className="px-2 py-1 border-t border-[#E3E0D5] align-top"
                              style={changed ? { background: dangerBg, color: dangerFg } : spec.untrusted ? { color: dangerFg } : undefined}
                            >
                              {changed ? fullCellText(row[name]) : cell.text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
