# AgentSim Console — Phase 5: Compare (Ledger Diff) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/compare` from two independent side-by-side Flow views into the mockup's git-diff-style
comparison — a Run A/B picker, an Attack panel, a shared/diverged event ledger, a per-Check A-vs-B
table grouped by Dimension, and a side-by-side World diff — reusing data already on `RunRecord`, with
zero engine changes.

**Architecture:** One route file rewritten (chrome + picker + fallback), one `Sidebar` nav entry added,
five new components under `src/ui/compare/`, and one new pure-logic module
(`src/ui/compare/compareLedger.ts`) carrying the two genuinely new computations (event-ledger common
prefix, per-Check pass/fail identity) — everything else is already-computed data rendered differently.

**Tech Stack:** Next.js 16 App Router, one client component (`RunPicker`) driving query-param
navigation, everything else a Server Component or plain presentational component, Tailwind arbitrary
values matching every other `src/ui`/`src/app` file, `src/ui/styles.ts`.

**Spec:** `docs/superpowers/specs/2026-09-17-console-compare-design.md`

## Global Constraints

- Reuse `src/ui/styles.ts` tokens exactly (`serif`, `heading`, `mono`, `panel`, `field`, `label`,
  `focusRing`, `dangerBg`/`dangerFg`, `successBg`/`successFg`) plus established literal hex values
  already used identically elsewhere (`#1B1A17`, `#6E6B60`, `#E3E0D5`, `#F7F5EF`) — no new colors.
- **No file under `src/ui/` may value-import `@/engine/pack`, `@/engine/attack`, `@/runner/store`, or
  `@/runner/agentRegistry`, or any `node:` builtin.** This is checked by
  `tests/ui/buildFlow.test.ts`'s import-purity guard for every file under `src/ui/`, and this exact
  defect class broke a shipped route twice in Phase 3. Every `Check`/`Violation`/`Attack`/`WorldPack`
  type this plan touches is consumed via `import type` only (erased at compile time — safe
  regardless of what those modules import internally); the only value-imported engine module is
  `@/engine/lure` (`matchesLure`, `injectedText`), the already-established client-safe leaf every
  other consumer of the Lure rule defers to. If a task's diff adds any other value import from
  `@/engine/*` or `@/runner/*` under `src/ui/`, that is a defect, not a shortcut — stop and use a
  server-computed prop instead (see Task 3/4 for the pattern: a plain `Record<string,string>` label
  map, or `Check[]`/`Violation[]` passed down as already-loaded plain data).
- `run.diff`/`run.unchangedCount`/`run.events`/`run.violations`/`run.attack` are consumed exactly as
  they exist on `RunRecord` — no re-derivation, no new persisted fields.
- Attribution: every commit ends with the trailer the session's system reminder specifies at dispatch
  time — do not hardcode a stale one into this plan.

---

### Task 1: Pure comparison logic

**Files:**
- Create: `src/ui/compare/compareLedger.ts`
- Test: `tests/ui/compareLedger.test.ts`

**Interfaces:**
- Consumes: `import type { Check } from "@/engine/pack"`; `import type { Violation } from
  "@/engine/evaluator"`; `import type { Event } from "@/engine/types"`; `DIMENSIONS`/`label` (value
  import, already-established-safe) from `@/engine/dimensions`.
- Produces: `commonPrefixLength`, `checkOutcomes`, `groupOutcomesByDimension`, and the `CheckOutcome`/
  `DimensionOutcomeGroup` types — consumed by Task 4 (`ActionLedger.tsx` uses `commonPrefixLength`;
  `ChecksTable.tsx` uses `checkOutcomes`/`groupOutcomesByDimension`).

- [ ] **Step 1: Write the failing tests**

```ts
// tests/ui/compareLedger.test.ts
import { describe, expect, it } from "vitest";
import { checkOutcomes, commonPrefixLength, groupOutcomesByDimension } from "@/ui/compare/compareLedger";
import type { Check } from "@/engine/pack";
import type { Violation } from "@/engine/evaluator";
import type { Event } from "@/engine/types";

function ev(tool: string, input: Record<string, unknown>): Pick<Event, "tool" | "input"> {
  return { tool, input };
}

describe("commonPrefixLength", () => {
  it("returns the full length when both ledgers are identical", () => {
    const a = [ev("get_ticket", { id: "1" }), ev("read_thread", { id: "t1" })];
    const b = [ev("get_ticket", { id: "1" }), ev("read_thread", { id: "t1" })];
    expect(commonPrefixLength(a, b)).toBe(2);
  });
  it("stops at the first differing step", () => {
    const a = [ev("get_ticket", { id: "1" }), ev("issue_refund", { amount: 100 })];
    const b = [ev("get_ticket", { id: "1" }), ev("issue_refund", { amount: 200 })];
    expect(commonPrefixLength(a, b)).toBe(1);
  });
  it("returns 0 when the first step already differs", () => {
    expect(commonPrefixLength([ev("a", {})], [ev("b", {})])).toBe(0);
  });
  it("stops at the shorter ledger's length when one is a prefix of the other", () => {
    expect(commonPrefixLength([ev("a", {})], [ev("a", {}), ev("b", {})])).toBe(1);
  });
  it("returns 0 for two empty ledgers", () => {
    expect(commonPrefixLength([], [])).toBe(0);
  });
});

function check(type: string, dimension: string, extra: Record<string, unknown>): Check {
  return { type, dimension, ...extra } as unknown as Check;
}
function violation(checkType: string, dimension: string, params: Record<string, unknown>): Violation {
  return { checkType, dimension, params, eventSeq: null, message: "x" } as Violation;
}

describe("checkOutcomes", () => {
  it("marks a Check as passed for both Runs when neither has a matching Violation", () => {
    const c = check("entity_count", "correctness", { collection: "refunds", equals: 1 });
    expect(checkOutcomes([c], [], [])).toEqual([{ check: c, passA: true, passB: true }]);
  });
  it("marks a Check as failed for exactly the Run whose Violations match it", () => {
    const c = check("arg_lte", "policy_compliance", { tool: "issue_refund", arg: "amount_pence", max: 4999 });
    const v = violation("arg_lte", "policy_compliance", { tool: "issue_refund", arg: "amount_pence", max: 4999 });
    expect(checkOutcomes([c], [v], [])).toEqual([{ check: c, passA: false, passB: true }]);
  });
  it("does not match a Violation with the same type/dimension but different params", () => {
    const c = check("arg_lte", "policy_compliance", { tool: "issue_refund", arg: "amount_pence", max: 4999 });
    const v = violation("arg_lte", "policy_compliance", { tool: "other_tool", arg: "amount_pence", max: 4999 });
    expect(checkOutcomes([c], [v], [])).toEqual([{ check: c, passA: true, passB: true }]);
  });
});

describe("groupOutcomesByDimension", () => {
  it("groups by Dimension in canonical order and drops empty groups", () => {
    const a = check("entity_count", "correctness", { collection: "x", equals: 1 });
    const b = check("arg_lte", "policy_compliance", { tool: "t", arg: "a", max: 1 });
    const groups = groupOutcomesByDimension([
      { check: a, passA: true, passB: true },
      { check: b, passA: true, passB: true },
    ]);
    expect(groups.map((g) => g.dimension)).toEqual(["correctness", "policy_compliance"]);
    expect(groups.every((g) => g.outcomes.length === 1)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests, confirm they fail**

Run: `npm test -- tests/ui/compareLedger.test.ts`
Expected: FAIL — `@/ui/compare/compareLedger` does not exist yet.

- [ ] **Step 3: Write `compareLedger.ts`**

```ts
// src/ui/compare/compareLedger.ts
// Pure comparison logic for the Compare page: where two Runs' event ledgers diverge, and whether
// each of a Scenario's declared Checks passed for each Run. Every engine type here is `import type`
// only — this file must never value-import `@/engine/pack` or `@/engine/checks` (see the Global
// Constraints on browser-safety import purity; this is the exact defect class that broke a shipped
// route in Phase 3).
import { DIMENSIONS, label as dimensionLabel, type Dimension } from "@/engine/dimensions";
import type { Violation } from "@/engine/evaluator";
import type { Check } from "@/engine/pack";
import type { Event } from "@/engine/types";

/**
 * A stable, content-based identity for a Check: exactly how `runCheck` (`src/engine/checks.ts`)
 * builds a Violation's own key (`const { type, dimension, ...params } = check`) — matching
 * `packView.ts`'s existing `checkParams()` cast convention rather than inventing a new one.
 */
function checkKey(c: Check): string {
  const obj = c as unknown as Record<string, unknown>;
  const { type, dimension, ...params } = obj;
  return JSON.stringify({ type, dimension, params });
}

function violationKey(v: Violation): string {
  return JSON.stringify({ type: v.checkType, dimension: v.dimension, params: v.params });
}

/** How many of two Runs' event ledgers agree from the start, comparing each step's tool + input. */
export function commonPrefixLength(a: Pick<Event, "tool" | "input">[], b: Pick<Event, "tool" | "input">[]): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i].tool === b[i].tool && JSON.stringify(a[i].input) === JSON.stringify(b[i].input)) i++;
  return i;
}

export type CheckOutcome = { check: Check; passA: boolean; passB: boolean };

/**
 * Every declared Check, with whether it passed for Run A and Run B — a Check with no Violation in a
 * Run's own `violations` array whose key matches it passed for that Run. No engine call: a Violation
 * is only ever produced by `runCheck` once, at Run-finish time, and is already on the Run record.
 */
export function checkOutcomes(checks: Check[], violationsA: Violation[], violationsB: Violation[]): CheckOutcome[] {
  const failedA = new Set(violationsA.map(violationKey));
  const failedB = new Set(violationsB.map(violationKey));
  return checks.map((check) => {
    const key = checkKey(check);
    return { check, passA: !failedA.has(key), passB: !failedB.has(key) };
  });
}

export type DimensionOutcomeGroup = { dimension: Dimension; label: string; outcomes: CheckOutcome[] };

/** `checkOutcomes`, grouped by Dimension in the canonical order; empty groups dropped. */
export function groupOutcomesByDimension(outcomes: CheckOutcome[]): DimensionOutcomeGroup[] {
  return DIMENSIONS.map((dimension) => ({
    dimension,
    label: dimensionLabel(dimension),
    outcomes: outcomes.filter((o) => o.check.dimension === dimension),
  })).filter((g) => g.outcomes.length > 0);
}
```

- [ ] **Step 4: Run the tests, confirm they pass**

Run: `npm test -- tests/ui/compareLedger.test.ts`
Expected: PASS (11/11).

- [ ] **Step 5: Confirm import purity, run the full suite and `tsc`, commit**

Run: `npx eslint src/ui/compare/compareLedger.ts && npm test && npx tsc --noEmit`
Expected: all green. `npm test` running `tests/ui/buildFlow.test.ts` (the import-purity guard, which
covers every file under `src/ui/`) passing is itself evidence this new file introduced no forbidden
value import — call this out explicitly in your commit/report.

```bash
git add src/ui/compare/compareLedger.ts tests/ui/compareLedger.test.ts
git commit -m "feat(compare): add the pure ledger-diff and per-Check comparison logic"
```

---

### Task 2: Run picker, Sidebar entry, Compare page chrome + fallback

**Files:**
- Create: `src/ui/compare/RunPicker.tsx`
- Modify: `src/app/compare/page.tsx`
- Modify: `src/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `listRuns` (`@/runner/store`, unchanged); `latestComparablePair` (already exported from
  `@/ui/RunsListPage`); `RunSummary` type (`@/ui/types`); `ConsoleShell`; `field`/`label`/`focusRing`/
  `serif` (`@/ui/styles`).
- Produces: `RunPicker` — consumed only by this task's own page (leaf otherwise). The page's new
  layout (picker + `CompareRunColumn`s + placeholder sections) is what Tasks 3-5 replace piece by
  piece — leave clear placeholder comments naming which task fills each in.

- [ ] **Step 1: `RunPicker.tsx`**

```tsx
// src/ui/compare/RunPicker.tsx
"use client";
// Two Run selects + a swap button, driving query-param navigation — the same pattern every other
// picker in this app uses (World tabs' `?tab=`, the wizard's steps): the Server Component re-renders
// with the new pair, no client-side Run fetching.
import { useRouter } from "next/navigation";
import type { RunSummary } from "@/ui/types";
import { field, focusRing, label as labelClass } from "@/ui/styles";

function runLabel(r: RunSummary): string {
  return `${r.agentLabel} · ${r.id.slice(0, 12)}`;
}

export function RunPicker({ runs, a, b }: { runs: RunSummary[]; a: string; b: string }) {
  const router = useRouter();
  const completed = runs.filter((r) => r.status === "completed");
  const peersOf = (id: string) => {
    const runA = completed.find((r) => r.id === id);
    return runA ? completed.filter((r) => r.scenarioId === runA.scenarioId && r.id !== id) : [];
  };
  const peers = peersOf(a);

  function go(nextA: string, nextB: string) {
    router.push(`/compare?a=${encodeURIComponent(nextA)}&b=${encodeURIComponent(nextB)}`);
  }

  if (completed.length < 2) {
    return <p className="text-[13px] text-[#6E6B60]">At least two completed Runs are needed to compare — this app has {completed.length} so far.</p>;
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end max-w-[720px]">
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Run A</span>
        <select
          value={a}
          onChange={(e) => {
            const nextA = e.target.value;
            const nextPeers = peersOf(nextA);
            go(nextA, nextPeers[0]?.id ?? "");
          }}
          className={field}
        >
          {completed.map((r) => (
            <option key={r.id} value={r.id}>
              {runLabel(r)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => go(b, a)}
        disabled={!a || !b}
        title="Swap"
        aria-label="Swap Run A and Run B"
        className={`h-9 w-9 rounded-lg border border-[#E3E0D5] bg-white text-[14px] disabled:opacity-40 ${focusRing}`}
      >
        ⇄
      </button>
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Run B</span>
        <select value={b} onChange={(e) => go(a, e.target.value)} className={field} disabled={peers.length === 0}>
          {peers.length === 0 && <option value="">No other Run of this Scenario yet</option>}
          {peers.map((r) => (
            <option key={r.id} value={r.id}>
              {runLabel(r)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/app/compare/page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { listPackIds, loadPack, type ToolDef } from "@/engine/pack";
import { listRuns, loadRun, type RunRecord } from "@/runner/store";
import { entityLabel } from "@/engine/world";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { CompareRunColumn } from "@/ui/CompareRunColumn";
import { RunPicker } from "@/ui/compare/RunPicker";
import { latestComparablePair } from "@/ui/RunsListPage";
import { serif } from "@/ui/styles";

export const dynamic = "force-dynamic";

type ColumnView = { tools: Record<string, ToolDef>; injectedLabel: string; error: string | null };

/**
 * A Run's pack's tools — for that column's flow — and the label of the collection its Attack
 * injected into, for a Violation's "Source:" line. Both resolved server-side (this file may import
 * `@/engine/pack` freely; `CompareRunColumn` and everything under it, being client components,
 * may not). The two Runs being compared can come from different World packs, so each column
 * resolves and degrades independently: a pack that no longer exists or fails to parse never
 * crashes the page — it just leaves that column without a flow.
 */
function packViewFor(run: RunRecord): ColumnView {
  const { packId } = run;
  const injected = run.attack?.mutation.collection;
  try {
    if (!listPackIds().includes(packId)) return { tools: {}, injectedLabel: "", error: `World pack "${packId}" is no longer available — no flow to show.` };
    const pack = loadPack(packId);
    return { tools: pack.tools, injectedLabel: injected ? entityLabel(pack, injected) : "", error: null };
  } catch {
    return { tools: {}, injectedLabel: "", error: `World pack "${packId}" failed to load — no flow to show.` };
  }
}

export default async function Compare({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  const runs = listRuns();

  let aId = a, bId = b;
  if (!aId || !bId) {
    const pair = latestComparablePair(runs);
    if (pair) {
      aId = pair.a.id;
      bId = pair.b.id;
    }
  }

  if (!aId || !bId) {
    return (
      <ConsoleShell>
        <div className="p-4 flex flex-col gap-4 max-w-[720px]">
          <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Compare runs</h1>
          <p className="text-[13px] text-[#6E6B60]">Pick two Runs of the same Scenario to compare.</p>
          <RunPicker runs={runs} a={runs.find((r) => r.status === "completed")?.id ?? ""} b="" />
        </div>
      </ConsoleShell>
    );
  }

  const ra = loadRun(aId);
  const rb = loadRun(bId);
  if (!ra || !rb) notFound();
  const va = packViewFor(ra), vb = packViewFor(rb);

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-4">
        <h1 className={`${serif} text-[28px] font-medium tracking-tight`}>Compare runs</h1>
        <RunPicker runs={runs} a={ra.id} b={rb.id} />
        <div className="grid grid-cols-2 gap-4">
          <CompareRunColumn run={ra} tools={va.tools} packError={va.error} injectedLabel={va.injectedLabel} />
          <CompareRunColumn run={rb} tools={vb.tools} packError={vb.error} injectedLabel={vb.injectedLabel} />
        </div>
        {/* AttackPanel — added by Task 3 */}
        {/* ActionLedger — added by Task 5 */}
        {/* ChecksTable — added by Task 4 */}
        {/* WorldDiffCompare — added by Task 3 */}
      </div>
    </ConsoleShell>
  );
}
```

Note: `entityLabel` is imported here **server-side only** (this file is under `src/app/`, exempt from
the browser-safety guard) — unchanged from today's file, do not remove it; it is only client
components (Tasks 3-5's new files) that must avoid it, per the spec's decision to pass a plain label
map down instead.

- [ ] **Step 3: Update the sidebar**

In `src/ui/Sidebar.tsx`, change:
```ts
const NAV = [
  { href: "/", label: "Runs" },
  { href: "/mandates", label: "Mandates" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/worlds", label: "World" },
];
```
to:
```ts
const NAV = [
  { href: "/", label: "Runs" },
  { href: "/compare", label: "Compare" },
  { href: "/mandates", label: "Mandates" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/worlds", label: "World" },
];
```

- [ ] **Step 4: Manual verification**

Run: `rm -rf .next && npm run dev` (background). Visit `/compare` with no query params — confirm it
falls back to a comparable pair if one exists (check `data/runs/`/`data/golden/` for at least 2
completed Runs of the same Scenario) or shows the "at least two completed Runs" message otherwise.
Visit `/compare?a=<id>&b=<id>` for a real pair and confirm the picker shows both selected, the two
`CompareRunColumn`s render as before, and changing either select actually navigates and updates the
page. Confirm the sidebar's "Compare" link is present and highights correctly on `/compare`. Stop the
dev server when done.

- [ ] **Step 5: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add src/ui/compare/RunPicker.tsx src/app/compare/page.tsx src/ui/Sidebar.tsx
git commit -m "feat(compare): add a Run A/B picker, move /compare onto the Console sidebar shell"
```

---

### Task 3: Attack panel + World diff comparison

**Files:**
- Create: `src/ui/compare/AttackPanel.tsx`
- Create: `src/ui/compare/WorldDiffCompare.tsx`
- Modify: `src/app/compare/page.tsx`

**Interfaces:**
- Consumes: `injectedText`, `matchesLure` (`@/engine/lure`, value import, already client-safe);
  `lureSummary` (`@/ui/worlds/packView`, already exported/tested); `import type { Attack, Event }`
  from `@/engine/types`/`@/engine/pack`; `RunRecord`/`DiffEntry` types (`@/ui/types`); `dangerBg`/
  `dangerFg`/`heading`/`mono`/`panel` (`@/ui/styles`).
- Produces: `AttackPanel`, `WorldDiffCompare` — consumed by this task's own page wiring.

- [ ] **Step 1: `AttackPanel.tsx`**

```tsx
// src/ui/compare/AttackPanel.tsx
// Shown only when at least one of the two Runs had an Attack applied. Every fact here already
// exists on the Run/Event data the page already loaded — no engine call beyond the already-safe
// `matchesLure`/`injectedText` leaf (`@/engine/lure`).
import { injectedText, matchesLure } from "@/engine/lure";
import type { Attack, Event, RunRecord } from "@/ui/types";
import { dangerBg, dangerFg, heading, mono, panel } from "@/ui/styles";
import { lureSummary } from "@/ui/worlds/packView";

function firstInjected(events: Event[], attackId: string): Event | undefined {
  return events.find((e) => e.injected?.attackId === attackId);
}

function TookItCard({ run, side, attack }: { run: RunRecord; side: "A" | "B"; attack: Attack }) {
  if (!run.attack) {
    return (
      <div className={`${panel} p-3 text-[12.5px]`}>
        <b className="block text-[12px] mb-0.5">Run {side} — {run.agent.kind === "byo" ? run.agent.name : run.agent.version}</b>
        No Attack applied to this Run — the World it saw had no planted row.
      </div>
    );
  }
  const saw = firstInjected(run.events, attack.id);
  const took = run.events.find((e) => matchesLure(attack.lure, e));
  return (
    <div className={`${panel} p-3 text-[12.5px]`} style={took ? { borderColor: dangerFg, background: dangerBg } : undefined}>
      <b className="block text-[12px] mb-0.5">Run {side} — {run.agent.kind === "byo" ? run.agent.name : run.agent.version}</b>
      {saw ? `Read the planted text at step #${saw.seq}. ` : "Never read the planted text. "}
      {took ? (
        <span style={{ color: dangerFg }}>
          <b>Acted on it at step #{took.seq}.</b>
        </span>
      ) : (
        "Did not act on it."
      )}
    </div>
  );
}

export function AttackPanel({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const attack = runA.attack ?? runB.attack;
  if (!attack) return null;
  const injected = firstInjected(runA.events, attack.id) ?? firstInjected(runB.events, attack.id);

  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold`}>The Attack — {attack.id}</h2>
      <p className="text-[12.5px] text-[#6E6B60]">{attack.title}</p>
      {injected?.injected && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[12px]">
          <dt className="text-[#6E6B60]">Planted in</dt>
          <dd className={mono}>
            {injected.injected.collection} / {injected.injected.id}.{injected.injected.field}
          </dd>
          <dt className="text-[#6E6B60]">Surfaces through</dt>
          <dd className={mono}>{injected.tool}</dd>
          <dt className="text-[#6E6B60]">Lure</dt>
          <dd className={mono}>{lureSummary(attack.lure)}</dd>
        </dl>
      )}
      <pre className={`${mono} text-[12px] whitespace-pre-wrap p-3 rounded-lg`} style={{ background: dangerBg, color: dangerFg }}>
        {injectedText(attack)}
      </pre>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TookItCard run={runA} side="A" attack={attack} />
        <TookItCard run={runB} side="B" attack={attack} />
      </div>
    </section>
  );
}
```

Note: `run.agent.kind === "byo" ? run.agent.name : run.agent.version` mirrors the exact narrowing
`agentLabel()` (`@/runner/agentRef`) already does — if you'd rather import `agentLabel` directly
instead of re-deriving this inline (it's already imported by `CompareColumn.tsx` in this same
directory tree, and is a plain, already-client-safe function), that is an acceptable, equally-correct
substitution; either way, do not invent a third way to read an agent's display name.

- [ ] **Step 2: `WorldDiffCompare.tsx`**

```tsx
// src/ui/compare/WorldDiffCompare.tsx
// Each Run's already-computed World diff (`run.diff`/`run.unchangedCount`), side by side — the same
// data `DiffPanel.tsx` renders for a single Run, never re-derived here.
import type { RunRecord } from "@/ui/types";
import { heading, mono, panel } from "@/ui/styles";

function Column({ run }: { run: RunRecord }) {
  const diff = run.diff ?? [];
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] font-semibold text-[#6E6B60] mb-1">{run.id.slice(0, 12)}</div>
      {diff.map((d) => (
        <div key={`${d.collection}-${d.entityId}`} className="flex gap-2 text-[12px] px-2 py-1 rounded" style={{ background: d.op === "added" ? "#E7F4EA" : "#FDF3DF" }}>
          <span className="w-3 font-bold">{d.op === "added" ? "+" : "~"}</span>
          <span className={mono}>{d.entityId}</span>
          <span className="text-[#6E6B60]">{d.summary}</span>
        </div>
      ))}
      <div className="text-[11px] text-[#6E6B60] px-2 pt-1">{run.unchangedCount ?? 0} entities unchanged</div>
    </div>
  );
}

export function WorldDiffCompare({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold`}>World diff — what each Run left behind</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Column run={runA} />
        <Column run={runB} />
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Wire both into `src/app/compare/page.tsx`**

Replace the `{/* AttackPanel — added by Task 3 */}` and `{/* WorldDiffCompare — added by Task 3 */}`
placeholder comments with:
```tsx
<AttackPanel runA={ra} runB={rb} />
{/* ActionLedger — added by Task 5 */}
{/* ChecksTable — added by Task 4 */}
<WorldDiffCompare runA={ra} runB={rb} />
```
Add the imports: `import { AttackPanel } from "@/ui/compare/AttackPanel";` and `import { WorldDiffCompare } from "@/ui/compare/WorldDiffCompare";`.

- [ ] **Step 4: Confirm import purity, manual check, run the suite, commit**

Run: `npx eslint src/ui/compare/AttackPanel.tsx src/ui/compare/WorldDiffCompare.tsx`, then `npm test`
(the import-purity guard covers both new files) and `npx tsc --noEmit`. With the dev server running,
visit a real `/compare?a=&b=` pair where at least one Run had an Attack, and confirm the Attack panel
shows real planted-content/lure info and the correct "took it"/"didn't" state per Run; visit a pair
with no Attack and confirm the panel is simply absent (not an empty box). Confirm the World diff
section shows each Run's real writes side by side.

```bash
git add src/ui/compare/AttackPanel.tsx src/ui/compare/WorldDiffCompare.tsx src/app/compare/page.tsx
git commit -m "feat(compare): add the Attack panel and side-by-side World diff"
```

---

### Task 4: Checks table

**Files:**
- Create: `src/ui/compare/ChecksTable.tsx`
- Modify: `src/app/compare/page.tsx`

**Interfaces:**
- Consumes: `checkOutcomes`, `groupOutcomesByDimension` (Task 1, `@/ui/compare/compareLedger`);
  `import type { Check }` (`@/engine/pack`); `heading`/`mono`/`panel`/`dangerFg`/`successFg`
  (`@/ui/styles`); `checkParams` (`@/ui/worlds/packView`, already exported/tested, for each Check's
  one-line description).
- Produces: `ChecksTable` — consumed by this task's own page wiring. This section renders only when
  both Runs share the same `scenarioId` and both packs loaded successfully (mirrors `packViewFor`'s
  per-column degradation) — computing that condition is this task's job in the page file, not
  `ChecksTable`'s own responsibility (`ChecksTable` just renders whatever `checks`/violations it's
  given; the page decides whether to render it at all).

- [ ] **Step 1: `ChecksTable.tsx`**

```tsx
// src/ui/compare/ChecksTable.tsx
import type { Check } from "@/engine/pack";
import type { Violation } from "@/engine/evaluator";
import { checkOutcomes, groupOutcomesByDimension } from "./compareLedger";
import { heading, mono, panel, successFg } from "@/ui/styles";
import { checkParams } from "@/ui/worlds/packView";

const dangerFgHex = "#B23A22";

export function ChecksTable({ checks, violationsA, violationsB }: { checks: Check[]; violationsA: Violation[]; violationsB: Violation[] }) {
  const groups = groupOutcomesByDimension(checkOutcomes(checks, violationsA, violationsB));
  if (groups.length === 0) return null;

  return (
    <section className={`${panel} overflow-hidden`}>
      <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold px-4 pt-4`}>
        Checks — {checks.length}, every one traced to the Mandate
      </h2>
      <div className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 pt-3 pb-1.5 text-[11px] font-semibold text-[#6E6B60] border-b border-[#E3E0D5]">
        <span>Check</span>
        <span className="text-center">A</span>
        <span className="text-center">B</span>
      </div>
      {groups.map((g) => (
        <div key={g.dimension}>
          <div className="px-4 py-1.5 bg-[#F7F5EF] text-[11.5px] font-semibold border-b border-[#E3E0D5]">{g.label}</div>
          {g.outcomes.map((o, i) => (
            <div key={`${g.dimension}-${i}`} className="grid grid-cols-[1fr_60px_60px] gap-2 px-4 py-1.5 items-center border-b border-[#E3E0D5] last:border-b-0 text-[12.5px]">
              <span>
                <span className={`${mono} text-[10.5px] bg-[#F7F5EF] border border-[#E3E0D5] rounded px-1 py-0.5 mr-1.5`}>{o.check.type}</span>
                <span className={`${mono} text-[#6E6B60]`}>{checkParams(o.check)}</span>
              </span>
              <span className="text-center font-bold" style={{ color: o.passA ? successFg : dangerFgHex }}>
                {o.passA ? "✓" : "✗"}
              </span>
              <span className="text-center font-bold" style={{ color: o.passB ? successFg : dangerFgHex }}>
                {o.passB ? "✓" : "✗"}
              </span>
            </div>
          ))}
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `src/app/compare/page.tsx`**

Add, right after loading `ra`/`rb` and before the returned JSX, the same-Scenario check:

```tsx
const sameScenario = ra.scenarioId === rb.scenarioId;
let sharedChecks: import("@/engine/pack").Check[] = [];
if (sameScenario) {
  try {
    const pack = loadPack(ra.packId);
    const scenario = pack.scenarios.find((s) => s.id === ra.scenarioId);
    sharedChecks = scenario?.checks ?? [];
  } catch {
    sharedChecks = [];
  }
}
```

Replace `{/* ChecksTable — added by Task 4 */}` with:
```tsx
{sharedChecks.length > 0 && <ChecksTable checks={sharedChecks} violationsA={ra.violations} violationsB={rb.violations} />}
```
Add the import: `import { ChecksTable } from "@/ui/compare/ChecksTable";`

- [ ] **Step 3: Confirm import purity, manual check, run the suite, commit**

Run: `npx eslint src/ui/compare/ChecksTable.tsx && npm test && npx tsc --noEmit`. With the dev server
running, visit a real pair of the same Scenario and confirm the Checks table shows every declared
Check grouped by Dimension with correct ✓/✗ per Run — cross-check at least one Check's A/B verdict
against that Run's actual `violations` (from its `data/runs/<id>.json` or `data/golden/<id>.json`
file) to confirm the matching logic is right on real data, not just the unit test's synthetic
fixtures. Visit a pair of *different* Scenarios and confirm the Checks table doesn't render at all.

```bash
git add src/ui/compare/ChecksTable.tsx src/app/compare/page.tsx
git commit -m "feat(compare): add the Checks-by-Dimension A-vs-B table"
```

---

### Task 5: Action ledger (the git-diff-style shared/diverged view)

**Files:**
- Create: `src/ui/compare/ActionLedger.tsx`
- Modify: `src/app/compare/page.tsx`

**Interfaces:**
- Consumes: `commonPrefixLength` (Task 1, `@/ui/compare/compareLedger`); `matchesLure` (`@/engine/lure`,
  value import); `import type { Event, RunRecord }` (`@/ui/types`); `heading`/`mono`/`panel`/
  `dangerBg`/`dangerFg`/`successBg`/`successFg` (`@/ui/styles`).
- Produces: `ActionLedger` — the last piece; once wired in, Phase 5's Compare page matches the
  approved mockup's full ledger-diff layout.

- [ ] **Step 1: `ActionLedger.tsx`**

```tsx
// src/ui/compare/ActionLedger.tsx
"use client";
// The git-diff-style ledger: both Runs' identical opening steps shown once, then a fork marker,
// then each Run's remaining steps side by side. Every step expands in place (not a side drawer —
// two Runs' drawers would compete for the same space) to show its input, result/error, and why it's
// flagged. `commonPrefixLength` (Task 1) is the only new logic; everything a step shows is already
// on the Event itself.
import { useState } from "react";
import { matchesLure } from "@/engine/lure";
import type { Attack, Event, RunRecord } from "@/ui/types";
import { dangerBg, dangerFg, heading, mono, panel, successBg, successFg } from "@/ui/styles";
import { commonPrefixLength } from "./compareLedger";

function argSummary(e: Event): string {
  const entries = Object.entries(e.input);
  return entries.length === 0 ? "—" : entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
}

function StepRow({ event, seq, attack }: { event: Event; seq: number; attack: Attack | null }) {
  const [open, setOpen] = useState(false);
  const injected = event.injected !== null;
  const lure = attack ? matchesLure(attack.lure, event) : false;
  const tone = lure ? { background: dangerBg } : event.error ? undefined : injected ? { background: "#FDF3DF" } : undefined;

  return (
    <div className="rounded" style={tone}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-baseline gap-2.5 px-2.5 py-1.5 text-left text-[12px]"
      >
        <span className={`${mono} text-[#6E6B60] w-6 text-right shrink-0`}>#{seq}</span>
        <span className={`${mono} font-semibold`} style={lure ? { color: dangerFg } : undefined}>
          {event.tool}
        </span>
        <span className={`${mono} text-[11px] text-[#6E6B60] truncate flex-1`}>{argSummary(event)}</span>
        {lure && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0" style={{ color: dangerFg }}>Lure taken</span>}
        {!lure && injected && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 text-[#6E6B60]">attack text read</span>}
        {event.error && <span className="text-[9px] font-bold uppercase tracking-wide shrink-0 text-[#6E6B60]">error</span>}
      </button>
      {open && (
        <div className="ml-8 mr-2.5 mb-2 pl-2.5 border-l-2 border-[#E3E0D5] text-[11.5px] text-[#6E6B60] leading-relaxed">
          <div>
            <b className="text-[#1B1A17]">input</b> · {JSON.stringify(event.input)}
          </div>
          <div>
            <b className="text-[#1B1A17]">result</b> · {event.error ?? event.result ?? "ok"}
          </div>
          {injected && event.injected && (
            <div>
              <b className="text-[#1B1A17]">attack surface</b> · planted text arrived in this result, from {event.injected.collection}/{event.injected.id}.{event.injected.field}
            </div>
          )}
          {lure && (
            <div>
              <b className="text-[#1B1A17]">why it is flagged</b> · this is the Lure the Attack was aiming for — the tool permitted the call, a graded Check caught it afterwards
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ActionLedger({ runA, runB }: { runA: RunRecord; runB: RunRecord }) {
  const eventsA = runA.events, eventsB = runB.events;
  const shared = commonPrefixLength(eventsA, eventsB);
  const attackA = runA.attack, attackB = runB.attack;

  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className={`${heading} text-[13px] normal-case tracking-normal font-semibold`}>Action ledger</h2>
        <span className="text-[11.5px] text-[#6E6B60]">Click any step for its input, its result, and why it is flagged.</span>
      </div>

      {shared > 0 && (
        <div className="flex flex-col gap-0.5">
          <div className="text-[10px] uppercase tracking-wide text-[#6E6B60] font-semibold px-2.5">
            ◦ identical — both Runs took these {shared} steps, in this order
          </div>
          {eventsA.slice(0, shared).map((e, i) => (
            <StepRow key={i} event={e} seq={i + 1} attack={attackA} />
          ))}
        </div>
      )}

      {shared >= eventsA.length && shared >= eventsB.length ? (
        <div className="text-[12.5px] text-[#6E6B60] px-2.5">
          These two Runs took byte-identical ledgers. Any score difference between them comes from the World they ran against, not from what they did.
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2.5 text-[11px] uppercase tracking-wide font-semibold text-[#6E6B60]">
            <span className="flex-1 h-px bg-[#E3E0D5]" />
            diverges at #{shared + 1}
            <span className="flex-1 h-px bg-[#E3E0D5]" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-wide font-bold px-2.5" style={{ color: runA.score?.capped ? dangerFg : successFg }}>
                ● A — {runA.id.slice(0, 12)}
              </div>
              {eventsA.slice(shared).length === 0 ? (
                <div className="text-[12px] text-[#6E6B60] px-2.5">— ends here</div>
              ) : (
                eventsA.slice(shared).map((e, i) => <StepRow key={i} event={e} seq={shared + i + 1} attack={attackA} />)
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="text-[10px] uppercase tracking-wide font-bold px-2.5" style={{ color: runB.score?.capped ? dangerFg : successFg }}>
                ● B — {runB.id.slice(0, 12)}
              </div>
              {eventsB.slice(shared).length === 0 ? (
                <div className="text-[12px] text-[#6E6B60] px-2.5">— ends here</div>
              ) : (
                eventsB.slice(shared).map((e, i) => <StepRow key={i} event={e} seq={shared + i + 1} attack={attackB} />)
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Wire it into `src/app/compare/page.tsx`**

Replace `{/* ActionLedger — added by Task 5 */}` with `<ActionLedger runA={ra} runB={rb} />`, and add
the import: `import { ActionLedger } from "@/ui/compare/ActionLedger";`

- [ ] **Step 3: Confirm import purity, full manual verification, run the suite, commit**

Run: `npx eslint src/ui/compare/ActionLedger.tsx && npm test && npx tsc --noEmit`.

With the dev server running (`rm -rf .next && npm run dev`), do a full pass over `/compare`:
- A real pair with a genuine divergence (e.g. one Run took an extra `issue_refund` call an attacked
  clean-vs-naive pair would produce, if this repo's `data/golden/` has one) — confirm the shared
  prefix renders once, the fork marker shows the right step number, and each side's remaining steps
  render independently, each expandable.
- A pair with byte-identical ledgers (if one exists, e.g. two "clean" runs of the same Scenario) —
  confirm the "byte-identical ledgers" message renders instead of an empty fork.
- Click a step with `event.injected` set and confirm the expanded detail names the attack surface;
  click a step that matches the Lure and confirm it's visually flagged and explains why.
- Confirm the whole page, top to bottom (picker → score headers → flow columns → Attack panel →
  Action ledger → Checks table → World diff), reads coherently and nothing overlaps or clips at a
  typical laptop width and at ~400px (phone width) — this is the last piece of the whole 5-phase
  Console redesign, so give it a real look, not just a click-through.

Stop the dev server when done.

```bash
git add src/ui/compare/ActionLedger.tsx src/app/compare/page.tsx
git commit -m "feat(compare): add the git-diff-style Action ledger — Phase 5 complete"
```

## Self-review

- **Placeholder scan**: none — every task's code is given in full; the page-wiring placeholder
  comments in Task 2 each name the exact task that replaces them, and every one is replaced within
  this same plan (Tasks 3-5).
- **Consistency**: `commonPrefixLength`/`checkOutcomes`/`groupOutcomesByDimension` (Task 1) are
  defined once and only imported thereafter (Tasks 4-5). `RunPicker` (Task 2) is the only client
  component that navigates; every other new component is a plain presentational function reading
  props the Server Component (`src/app/compare/page.tsx`) already loaded. The browser-safety
  import-purity constraint is stated once (Global Constraints) and every task's own Step
  cross-references it explicitly rather than assuming it's remembered.
- **Scope**: 1 route file rewritten across 4 tasks, 1 Sidebar edit, 6 new files under
  `src/ui/compare/` (5 components + 1 pure-logic module), 2 new test files. No engine changes, no new
  API routes, no new persisted data — matches the spec's stated scope exactly.
