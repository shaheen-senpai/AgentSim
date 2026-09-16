# AgentSim Console — Phase 3: World Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize `/worlds`, `/worlds/:id`, `/worlds/new` onto the Console's sidebar shell and the
mockup's Overview / Entities / Tools / Scenarios (+ Agents) tab structure, replacing the separate
"Seed" tab with a per-entity drill-down that can preview an Attack's effect on seed data, and
migrating `src/ui/worlds/*` off its own hand-rolled palette onto the shared `src/ui/styles.ts` tokens.

**Architecture:** One new component (`EntityBrowser.tsx`, replacing `SeedTables.tsx`) reusing the
engine's own `seedWorld`/`applyAttack` for the Attack preview and `packView.ts`'s existing
`previewRows`/`cellText` for row rendering; a tab-set rename in `packView.ts`; a chrome swap on 3
route files; a mechanical, literal-only color migration across the rest of `src/ui/worlds/*`.

**Tech Stack:** Next.js 16 App Router, React client component for the one interactive tab
(`EntityBrowser`), Tailwind arbitrary values matching every other `src/ui` file, `src/ui/styles.ts`.

**Spec:** `docs/superpowers/specs/2026-09-16-console-world-design.md`

## Global Constraints

- Reuse `src/ui/styles.ts` tokens exactly (`panel`, `heading`, `mono`, `serif`, `focusRing`,
  `dangerBg`, `dangerFg`, `successBg`, `successFg`) — no new colors, no new CSS.
- `seedWorld` (`src/engine/world.ts`) and `applyAttack` (`src/engine/attack.ts`) are consumed exactly
  as they exist today — no engine changes, no reimplementation of mutation logic.
- `previewRows`/`cellText` (`src/ui/worlds/packView.ts`) are reused by `EntityBrowser`, not
  duplicated — one seed-row-formatting implementation for the whole app.
- `PackEditor.tsx`'s Validate/Save toolbar, YAML-edit toggling, and scenario add/delete logic are
  **never touched** by this plan — every task that lands inside that file changes color literals
  only, never behavior. If a task's diff to `PackEditor.tsx` touches anything but a `className`'s
  hex string, that is a defect, not scope.
- Attribution: every commit ends with the trailer the session's system reminder specifies at dispatch
  time (do not hardcode a stale one into this plan).

---

### Task 1: `EntityBrowser.tsx` — the new Entities tab

**Files:**
- Create: `src/ui/worlds/EntityBrowser.tsx`
- Test: `tests/ui/entityBrowser.test.ts`

**Interfaces:**
- Consumes: `seedWorld(pack: WorldPack): World` (`src/engine/world.ts`), `applyAttack(pack, world,
  attack): void` (`src/engine/attack.ts`), `previewRows`/`cellText` (`src/ui/worlds/packView.ts`,
  unchanged), `WorldPack`/`Scenario`/`Attack`/`Row` types (`@/engine/pack`, `@/engine/types`).
- Produces: `EntityBrowser({ pack: WorldPack })` component and an exported pure helper
  `attackOptions(scenarios: Scenario[]): { key: string; label: string; attack: Attack }[]` — consumed
  by Task 2 (`[id]/page.tsx`'s `Body`, which already has a `pack: WorldPack` in scope) and by this
  task's own test.

- [ ] **Step 1: Write the failing test for `attackOptions`**

```ts
import { describe, expect, it } from "vitest";
import { attackOptions } from "@/ui/worlds/EntityBrowser";
import type { Scenario } from "@/engine/pack";

function scenario(id: string, title: string, attackIds: string[]): Scenario {
  return {
    id,
    title,
    task_brief: "",
    policy: { text: "" },
    checks: [],
    attacks: attackIds.map((aid) => ({
      id: aid,
      title: `${aid} title`,
      mutation: { type: "set_field", collection: "x", id: "x1", field: "f", value: "v" },
      lure: { tool: "t", args_match: {} },
    })),
  };
}

describe("attackOptions", () => {
  it("returns one option per Attack, unlabeled with a Scenario title when only one Scenario contributes Attacks", () => {
    const opts = attackOptions([scenario("s1", "First Scenario", ["a1", "a2"])]);
    expect(opts).toEqual([
      { key: "s1::a1", label: "a1", attack: expect.objectContaining({ id: "a1" }) },
      { key: "s1::a2", label: "a2", attack: expect.objectContaining({ id: "a2" }) },
    ]);
  });

  it("labels with the Scenario title when more than one Scenario contributes Attacks", () => {
    const opts = attackOptions([scenario("s1", "First Scenario", ["a1"]), scenario("s2", "Second Scenario", ["a2"])]);
    expect(opts.map((o) => o.label)).toEqual(["a1 (First Scenario)", "a2 (Second Scenario)"]);
  });

  it("returns an empty array when no Scenario has an Attack", () => {
    expect(attackOptions([scenario("s1", "First Scenario", [])])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it, confirm it fails**

Run: `npm test -- tests/ui/entityBrowser.test.ts`
Expected: FAIL — `attackOptions` is not exported (the file doesn't exist yet).

- [ ] **Step 3: Write `EntityBrowser.tsx`**

```tsx
"use client";
// The Entities tab (replaces the old Seed tab): browse one entity at a time — its field defs, and
// its seed rows either as seeded, or as they'd look under one of the pack's Attacks. The "under
// Attack" preview is computed with the engine's own seedWorld/applyAttack — the exact functions a
// real Run calls before its start Snapshot — never reimplemented here.
import { useMemo, useState } from "react";
import { applyAttack } from "@/engine/attack";
import type { Attack, Scenario, WorldPack } from "@/engine/pack";
import type { Row } from "@/engine/types";
import { seedWorld } from "@/engine/world";
import { dangerBg, dangerFg, focusRing, heading, mono } from "@/ui/styles";
import { cellText, previewRows } from "./packView";

export type AttackOption = { key: string; label: string; attack: Attack };

/** Every distinct Attack across every Scenario in the pack, deduped by Scenario+Attack id. */
export function attackOptions(scenarios: Scenario[]): AttackOption[] {
  const contributing = new Set(scenarios.filter((s) => s.attacks.length > 0).map((s) => s.id));
  const multi = contributing.size > 1;
  const seen = new Set<string>();
  const out: AttackOption[] = [];
  for (const s of scenarios) {
    for (const a of s.attacks) {
      const key = `${s.id}::${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, label: multi ? `${a.id} (${s.title})` : a.id, attack: a });
    }
  }
  return out;
}

function UntrustedDot() {
  return <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: dangerFg }} />;
}

export function EntityBrowser({ pack }: { pack: WorldPack }) {
  const { meta, seed, scenarios } = pack;
  const entityNames = Object.keys(meta.entities);
  const [selected, setSelected] = useState(meta.principal);
  const options = useMemo(() => attackOptions(scenarios), [scenarios]);
  const [mode, setMode] = useState<string>("seeded");

  const rows = useMemo(() => {
    if (mode === "seeded") return seed.rows;
    const opt = options.find((o) => o.key === mode);
    if (!opt) return seed.rows;
    const world = seedWorld(pack);
    applyAttack(pack, world, opt.attack);
    return world.collections;
  }, [pack, mode, options, seed.rows]);

  const sel = meta.entities[selected];
  const fields = Object.entries(sel.fields);
  const selRows: Row[] = rows[selected] ?? [];
  const preview = previewRows(selRows);
  const untrustedFieldName = fields.find(([, f]) => f.untrusted)?.[0] ?? null;
  const seededIds = new Set((seed.rows[selected] ?? []).map((r) => r.id));
  const isPlanted = (row: Row) => mode !== "seeded" && !seededIds.has(row.id);

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
              className={`flex w-full items-center gap-1.5 px-2.5 py-2 text-left border-b border-[#E3E0D5] last:border-b-0 ${focusRing} ${
                active ? "bg-[#1B1A17] text-white" : "bg-white text-[#1B1A17] hover:bg-[#F7F5EF]"
              }`}
            >
              <span className={`${mono} text-[12px]`}>{name}</span>
              {hasUntrusted && <span className={`text-[10px] ${active ? "text-white" : ""}`} style={active ? undefined : { color: dangerFg }}>⚠</span>}
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
          {options.length > 0 && (
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              aria-label="Seed data mode"
              className={`ml-auto text-[12px] border border-[#E3E0D5] rounded px-2 py-1 bg-white ${focusRing}`}
            >
              <option value="seeded">as seeded</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  under Attack — {o.label}
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
            {mode !== "seeded" ? " · Attack applied" : ""}
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
                  {preview.shown.map((row) => (
                    <tr key={String(row.id)} style={isPlanted(row) ? { background: dangerBg } : undefined}>
                      {fields.map(([name, spec]) => {
                        const cell = cellText(row[name], spec);
                        return (
                          <td
                            key={name}
                            title={cell.title ?? undefined}
                            className="px-2 py-1 border-t border-[#E3E0D5] align-top"
                            style={spec.untrusted ? { color: dangerFg } : undefined}
                          >
                            {cell.text}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, confirm it passes**

Run: `npm test -- tests/ui/entityBrowser.test.ts`
Expected: PASS (3/3).

- [ ] **Step 5: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green, no type errors.

```bash
git add src/ui/worlds/EntityBrowser.tsx tests/ui/entityBrowser.test.ts
git commit -m "feat(worlds): add the Entities tab — per-entity drill-down with an as-seeded/under-Attack seed preview"
```

---

### Task 2: Tab-set rename, routing, delete `SeedTables.tsx`

**Files:**
- Modify: `src/ui/worlds/packView.ts`
- Modify: `src/app/worlds/[id]/page.tsx`
- Delete: `src/ui/worlds/SeedTables.tsx`
- Modify: `tests/ui/packView.test.ts` (update any assertion referencing `"seed"` as a tab; check first
  whether any exist before assuming)

**Interfaces:**
- Consumes: `EntityBrowser` from Task 1.
- Produces: `WORLD_TABS = ["overview","entities","tools","scenarios","agents"]` — consumed by
  `PackTabs.tsx` (unchanged import, already iterates `WORLD_TABS`) and Task 3/4's files.

- [ ] **Step 1: Rename the tab set in `packView.ts`**

Change:
```ts
export const WORLD_TABS = ["overview", "seed", "tools", "scenarios", "agents"] as const;
```
to:
```ts
export const WORLD_TABS = ["overview", "entities", "tools", "scenarios", "agents"] as const;
```

Change the `TAB_LABELS` record's `seed: "Seed"` entry to `entities: "Entities"` (keep it in the same
position in the object so the tab strip's order is unchanged).

- [ ] **Step 2: Update `Body()` in `src/app/worlds/[id]/page.tsx`**

Replace the `SeedTables` import with `EntityBrowser`, and change:
```tsx
case "seed":
  return <SeedTables meta={pack.meta} seed={pack.seed} />;
```
to:
```tsx
case "entities":
  return <EntityBrowser pack={pack} />;
```
(`rowCounts` stays computed only for the `"overview"` case that still needs it — do not remove that
computation.)

- [ ] **Step 3: Delete `SeedTables.tsx`, check for other importers**

```bash
grep -rn "SeedTables" src/ tests/
```
Expected: no remaining references once this task's edits land. Delete the file:
```bash
rm src/ui/worlds/SeedTables.tsx
```

- [ ] **Step 4: Check and fix `tests/ui/packView.test.ts`**

Run: `grep -n '"seed"' tests/ui/packView.test.ts`. If any assertion references the `"seed"` tab
literal (e.g. testing `parseTab`'s fallback set, or `tabHref`), update it to `"entities"` — keep the
same test structure, only the literal changes. If none exist, no change needed here.

- [ ] **Step 5: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green — this confirms no other file still imports `SeedTables` or references the old
`"seed"` tab value.

```bash
git add src/ui/worlds/packView.ts src/app/worlds/[id]/page.tsx tests/ui/packView.test.ts
git rm src/ui/worlds/SeedTables.tsx
git commit -m "feat(worlds): rename the Seed tab to Entities, route it to EntityBrowser"
```

---

### Task 3: `ConsoleShell` chrome for `/worlds`, `/worlds/:id`, `/worlds/new`

**Files:**
- Modify: `src/app/worlds/page.tsx`
- Modify: `src/app/worlds/[id]/page.tsx`
- Modify: `src/app/worlds/new/page.tsx`

**Interfaces:**
- Consumes: `ConsoleShell` (`src/ui/ConsoleShell.tsx`, unchanged since Phase 1).
- Produces: nothing new — pure chrome swap.

- [ ] **Step 1: `src/app/worlds/page.tsx`**

Replace the `Header` import with `ConsoleShell`:
```tsx
import { ConsoleShell } from "@/ui/ConsoleShell";
```
Replace the returned JSX's outer shell:
```tsx
return (
  <ConsoleShell>
    <main className="p-4 flex flex-col gap-4 max-w-[1200px]">
      {/* ...unchanged body... */}
    </main>
  </ConsoleShell>
);
```
Remove the now-unused `<Header run={null} />` line and its import. Remove the `min-h-screen text-sm`
wrapper `<div>` (`ConsoleShell` already provides the page background and `text-sm`).

- [ ] **Step 2: `src/app/worlds/[id]/page.tsx`**

Same swap, applied to both the success-path return and the `LoadError` component (both currently
render `<Header run={null} />` inside a `min-h-screen text-sm` div). Wrap each in `<ConsoleShell>`
instead, remove the `Header` import.

- [ ] **Step 3: `src/app/worlds/new/page.tsx`**

Same swap.

- [ ] **Step 4: Manual sanity check**

Run: `rm -rf .next && npm run dev` (background), then confirm `/worlds`, `/worlds/:id` (any installed
pack id), and `/worlds/new` each render the sidebar and no longer render the old top `Header`. Stop
the dev server when done.

- [ ] **Step 5: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add src/app/worlds/page.tsx src/app/worlds/[id]/page.tsx src/app/worlds/new/page.tsx
git commit -m "feat(worlds): move /worlds, /worlds/:id, /worlds/new onto the Console sidebar shell"
```

---

### Task 4: Token migration across `src/ui/worlds/*`

**Files:**
- Modify: `src/ui/worlds/EntityMap.tsx`
- Modify: `src/ui/worlds/ToolCards.tsx`
- Modify: `src/ui/worlds/ScenarioCards.tsx`
- Modify: `src/ui/worlds/AgentPrompts.tsx`
- Modify: `src/ui/worlds/PackCard.tsx`
- Modify: `src/ui/worlds/PackTabs.tsx`
- Modify: `src/ui/worlds/PackEditor.tsx`
- Modify: `src/ui/worlds/NewWorld.tsx`
- Modify: `src/ui/worlds/YamlEditor.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — literal-only color substitution, no behavior change anywhere.

This task is a **mechanical, literal-only find-and-replace** across the 9 files above. Do not change
any logic, prop, JSX structure, or class name beyond the substitutions below. If a substitution would
require touching anything else to keep the file compiling, stop and report it rather than improvising
a workaround.

- [ ] **Step 1: Confirm the mapping against `src/ui/styles.ts`**

Read `src/ui/styles.ts` and confirm these token values (already established by Phase 1/2, do not
change `styles.ts` itself in this task):
- `#1B1A17` = ink (used bare in `panel`/`primaryButton`/etc — there is no standalone `ink` export;
  use the literal hex `#1B1A17` in Tailwind arbitrary values, exactly as `src/ui/wizard/*` already
  does)
- `#6E6B60` = muted text
- `#E3E0D5` = border
- `#B23A22` = `dangerFg`
- `#FBEAE7` = `dangerBg`
- `#F7F5EF` = page background (used bare as a Tailwind arbitrary value across `src/ui`, e.g.
  `src/ui/ConsoleShell.tsx`, `src/ui/Sidebar.tsx` — not a named `styles.ts` export; use the literal)

- [ ] **Step 2: Apply the substitutions**

In each of the 9 files, replace every occurrence (in `className` strings, inline `style` objects, and
raw hex literals alike) per this exact table:

| Old | New |
|---|---|
| `#1d1d1b` | `#1B1A17` |
| `#6b6b66` | `#6E6B60` |
| `#cfcfcb` | `#E3E0D5` |
| `#c8321e` | `#B23A22` |
| `#fbeeea` | `#FBEAE7` |
| `#f4f4f2` | `#F7F5EF` |
| `#e6e6e2` | `#E3E0D5` |

(`#e6e6e2` was a second, slightly-lighter divider color some of these files use for inner borders —
verify by grepping each file for it before assuming it's absent; where present, it maps onto the same
`#E3E0D5` border token, since the Console redesign uses one border color, not two.)

Where a file already imports from `@/ui/styles` (check each file — several may not), prefer importing
the named token (`heading`, `mono`, `panel`, `dangerFg`, `dangerBg`) over a literal hex wherever the
existing code already builds one of those exact class strings by hand; otherwise use the literal hex
value from the table. Do not introduce new imports purely for this task if a file doesn't already
import from `@/ui/styles` — a plain literal substitution is sufficient and lower-risk.

- [ ] **Step 3: Grep-verify no old hex remains**

```bash
grep -rniE '#1d1d1b|#6b6b66|#cfcfcb|#c8321e|#fbeeea|#f4f4f2|#e6e6e2' src/ui/worlds/
```
Expected: no output.

- [ ] **Step 4: Manual visual check**

With the dev server running (`rm -rf .next && npm run dev`), visit `/worlds`, a pack's Overview,
Entities, Tools, Scenarios, and Agents tabs, and `/worlds/new` (all three modes: From template,
Generate with Claude, Connect your agent). Confirm nothing looks broken (a missed substitution would
show as a jarringly different shade next to the rest of the page, not a crash) and that Validate/Save
on a real pack still works exactly as before (this task must not change that behavior — if it does,
you've touched something beyond a color literal; revert that part and report it).

- [ ] **Step 5: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green — no test in this repo asserts on a specific hex value in `src/ui/worlds`, so a
clean suite plus the grep in Step 3 is the real verification here.

```bash
git add src/ui/worlds/EntityMap.tsx src/ui/worlds/ToolCards.tsx src/ui/worlds/ScenarioCards.tsx \
  src/ui/worlds/AgentPrompts.tsx src/ui/worlds/PackCard.tsx src/ui/worlds/PackTabs.tsx \
  src/ui/worlds/PackEditor.tsx src/ui/worlds/NewWorld.tsx src/ui/worlds/YamlEditor.tsx
git commit -m "style(worlds): migrate src/ui/worlds' hand-rolled palette onto the shared Console tokens"
```

## Self-review

- **Placeholder scan**: none — `EntityBrowser`'s full implementation is given, the tab-rename is a
  literal old→new value pair, the chrome swap is a named component substitution, and the color
  migration is an exhaustive literal table with a grep-based completion check.
- **Consistency**: Task 1 defines `attackOptions`/`EntityBrowser`, Task 2 is the only consumer
  (`[id]/page.tsx`'s `Body`) and imports them under the same names. `WORLD_TABS`'s new `"entities"`
  value is introduced once (Task 2) and nothing else in the plan references the old `"seed"` value
  after that task.
- **Scope**: 1 new file, 1 deleted file, 12 modified files across 4 tasks. No engine changes;
  `seedWorld`/`applyAttack` consumed exactly as they exist. `PackEditor.tsx`'s actual editing logic is
  explicitly protected by a Global Constraint, not just left implicit.
