# AgentSim Console — Phase 4: Scenarios + Mandates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the two sidebar nav items withheld since Phase 1 — a cross-World Scenarios list +
detail, and a read-only Mandates library — reusing the already-shipped `ScenarioCard` content and the
existing `loadPacks()`/`checksByDimension`/`truncate` helpers. No new data model, no new API routes.

**Architecture:** Three new routes (`/scenarios`, `/scenarios/:packId/:scenarioId`, `/mandates`), two
small new presentational components (`ScenarioListCard`, `MandateCard`), one visibility change
(`ScenarioCard` becomes exported from `ScenarioCards.tsx`), and a `Sidebar` nav update. Every route is
a Server Component, matching the rest of `src/app/**` — no client state anywhere in this plan.

**Tech Stack:** Next.js 16 App Router, Server Components, Tailwind arbitrary values matching every
other `src/ui`/`src/app` file, `src/ui/styles.ts`.

**Spec:** `docs/superpowers/specs/2026-09-17-console-scenarios-mandates-design.md`

## Global Constraints

- Reuse `src/ui/styles.ts` tokens exactly (`serif`, `heading`, `mono`) plus the established literal
  hex values already used identically elsewhere in `src/ui`/`src/app` (`#1B1A17`, `#6E6B60`,
  `#E3E0D5`, `#F7F5EF`) — no new colors, no new CSS.
- No new API routes; no new types in `src/lib/summaries.ts` — every page in this plan is a Server
  Component reading `WorldPack`/`Scenario` directly via `loadPacks()`/`loadPack()`.
- `ScenarioCard`'s behavior is unchanged by this plan — only its export visibility changes. Its
  existing consumer (`ScenarioCards`, the World Scenarios tab) must keep working identically.
- Attribution: every commit ends with the trailer the session's system reminder specifies at dispatch
  time — do not hardcode a stale one into this plan.

---

### Task 1: Export `ScenarioCard`, add the Scenario detail route, update the sidebar

**Files:**
- Modify: `src/ui/worlds/ScenarioCards.tsx`
- Create: `src/app/scenarios/[packId]/[scenarioId]/page.tsx`
- Modify: `src/ui/Sidebar.tsx`

**Interfaces:**
- Consumes: `loadPack`, `listPackIds`, `PACK_ID_RE` (`@/engine/pack`, already used identically by
  `src/app/worlds/[id]/page.tsx`); `ConsoleShell` (`@/ui/ConsoleShell`); `serif` (`@/ui/styles`).
- Produces: `ScenarioCard` exported from `@/ui/worlds/ScenarioCards` — consumed by this task's own
  detail route, and available for any future reuse.

- [ ] **Step 1: Export `ScenarioCard`**

In `src/ui/worlds/ScenarioCards.tsx`, change:
```tsx
function ScenarioCard({ packId, scenario }: { packId: string; scenario: Scenario }) {
```
to:
```tsx
export function ScenarioCard({ packId, scenario }: { packId: string; scenario: Scenario }) {
```
Nothing else in this file changes — `ScenarioCards` (plural) still calls `ScenarioCard` the same way
it always has.

- [ ] **Step 2: Write the Scenario detail route**

```tsx
// src/app/scenarios/[packId]/[scenarioId]/page.tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE } from "@/engine/pack";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { serif } from "@/ui/styles";
import { ScenarioCard } from "@/ui/worlds/ScenarioCards";

export const dynamic = "force-dynamic";

type Params = Promise<{ packId: string; scenarioId: string }>;

export default async function ScenarioDetailPage({ params }: { params: Params }) {
  const { packId, scenarioId } = await params;

  // Mirrors `/worlds/[id]/page.tsx`'s validate-before-load pattern, one level down: a pack id that
  // isn't installed, or fails to load, or a scenario id that doesn't belong to it, all 404 — this is
  // a read-only derived view, not the pack editor, so there is no separate "show me why it broke"
  // path here the way `/worlds/[id]`'s `LoadError` gives the editor.
  if (!PACK_ID_RE.test(packId) || !listPackIds().includes(packId)) notFound();

  const pack = (() => {
    try {
      return loadPack(packId);
    } catch {
      return null;
    }
  })();
  if (!pack) notFound();

  const scenario = pack.scenarios.find((s) => s.id === scenarioId);
  if (!scenario) notFound();

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-3 max-w-[900px]">
        <Link href="/scenarios" className="text-[12px] text-[#6E6B60] underline decoration-dotted hover:text-[#1B1A17] self-start">
          ← Scenarios
        </Link>
        <div className="text-xs text-[#6E6B60]">
          Scenarios / <b className="text-[#1B1A17]">{scenario.title}</b>
        </div>
        <h1 className={`${serif} text-[28px] font-medium tracking-tight`}>{scenario.title}</h1>
        <p className="text-[12px] text-[#6E6B60]">
          {pack.meta.name} <span className="font-mono">· {pack.meta.id}</span>
        </p>
        <ScenarioCard packId={pack.meta.id} scenario={scenario} />
      </div>
    </ConsoleShell>
  );
}
```

- [ ] **Step 3: Update the sidebar**

In `src/ui/Sidebar.tsx`, change:
```ts
const NAV = [
  { href: "/", label: "Runs" },
  { href: "/worlds", label: "World" },
];
```
to:
```ts
const NAV = [
  { href: "/", label: "Runs" },
  { href: "/mandates", label: "Mandates" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/worlds", label: "World" },
];
```
(`/mandates` doesn't exist yet as a route until Task 3 of this plan — that's fine, the nav link
simply 404s until then; if you're executing tasks out of order, note this, but the plan's intended
order lands `/mandates` before this nav change is exercised end-to-end.)

- [ ] **Step 4: Check for an existing route-test convention, else verify manually**

Check whether any file under `tests/` already tests a Next.js page/route component directly (as
opposed to testing pure helpers it calls). If such a convention exists, follow it for this route's
404 branches. If none exists (check first — do not assume), rely on Step 5's manual verification
instead of inventing a new test harness for a single route file.

- [ ] **Step 5: Manual verification**

Run: `rm -rf .next && npm run dev` (background; this repo has a known dev-server/build cache
collision, so clearing `.next` first is required). Visit `/scenarios/<a-real-pack-id>/<a-real-scenario-id>`
(list `worldpacks/` and each pack's `scenarios/` directory for real ids) and confirm the page renders
the Scenario's Task Brief/Policy/Checks/Attacks and a working "▷ Run this" link. Then visit
`/scenarios/not-a-real-pack/anything` and `/scenarios/<a-real-pack-id>/not-a-real-scenario` and
confirm both 404 (Next's default not-found page, or this repo's custom one if it has one — check
`src/app/not-found.tsx` if present). Stop the dev server when done.

- [ ] **Step 6: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green, no type errors.

```bash
git add src/ui/worlds/ScenarioCards.tsx src/app/scenarios src/ui/Sidebar.tsx
git commit -m "feat(scenarios): export ScenarioCard, add the Scenario detail route, add Scenarios/Mandates to the sidebar"
```

---

### Task 2: Scenarios list page

**Files:**
- Create: `src/ui/scenarios/ScenarioListCard.tsx`
- Create: `src/app/scenarios/page.tsx`

**Interfaces:**
- Consumes: `loadPacks` (`@/lib/summaries`); `truncate` (`@/ui/worlds/packView`, already exported and
  tested); `Scenario` type (`@/engine/pack`); `ConsoleShell`; `serif` (`@/ui/styles`).
- Produces: nothing consumed elsewhere in this plan — a leaf list page.

- [ ] **Step 1: `ScenarioListCard.tsx`**

```tsx
// The compact card on the cross-World Scenarios list: title, a one-line Task Brief, and Checks/
// Attacks counts. The full detail (Policy, Checks by Dimension, Attacks with Lure) is one click away
// at the Scenario's own detail route — this card is deliberately not the same content ScenarioCard
// renders, or the list page would just be the World Scenarios tab repeated once per pack.
import Link from "next/link";
import type { Scenario } from "@/engine/pack";
import { serif } from "@/ui/styles";
import { truncate } from "@/ui/worlds/packView";

export function ScenarioListCard({ packId, packName, scenario }: { packId: string; packName: string; scenario: Scenario }) {
  const brief = truncate(scenario.task_brief, 140);
  return (
    <Link
      href={`/scenarios/${encodeURIComponent(packId)}/${encodeURIComponent(scenario.id)}`}
      className="bg-white border border-[#E3E0D5] rounded-lg p-4 flex flex-col gap-2 hover:border-[#1B1A17] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17]"
    >
      <h2 className={`${serif} text-[15px] font-semibold`}>{scenario.title}</h2>
      <p className="text-[12.5px] text-[#6E6B60]" title={brief.truncated ? scenario.task_brief.trim() : undefined}>
        {packName} — {brief.text}
      </p>
      <div className="flex gap-2 mt-1">
        <span className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">
          {scenario.checks.length} {scenario.checks.length === 1 ? "Check" : "Checks"}
        </span>
        <span className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">
          {scenario.attacks.length} {scenario.attacks.length === 1 ? "Attack" : "Attacks"}
        </span>
      </div>
    </Link>
  );
}
```

- [ ] **Step 2: `src/app/scenarios/page.tsx`**

```tsx
import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { serif } from "@/ui/styles";
import { ScenarioListCard } from "@/ui/scenarios/ScenarioListCard";

export const dynamic = "force-dynamic";

export default function ScenariosPage() {
  const { packs } = loadPacks();
  const pairs = packs.flatMap((p) => p.scenarios.map((s) => ({ pack: p, scenario: s })));

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-4 max-w-[900px]">
        <div className="text-xs text-[#6E6B60]">AgentSim</div>
        <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Scenarios</h1>
        <p className="text-[13px] text-[#6E6B60] max-w-[70ch]">Every Task Brief, Policy and Attack, across every World.</p>
        {pairs.length === 0 ? (
          <p className="text-[13px] text-[#6E6B60]">No Scenarios found across any installed World.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pairs.map(({ pack, scenario }) => (
              <ScenarioListCard key={`${pack.meta.id}::${scenario.id}`} packId={pack.meta.id} packName={pack.meta.name} scenario={scenario} />
            ))}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
```

- [ ] **Step 3: Manual verification**

With the dev server running (`rm -rf .next && npm run dev`), visit `/scenarios` and confirm every
installed pack's Scenarios appear as cards, each linking to its detail route (Task 1). Confirm the
empty-state message would show if no packs existed (you don't need to actually empty `worldpacks/` to
verify this — reading the conditional is enough, but note in your report whether you did or didn't
exercise it live). Stop the dev server when done.

- [ ] **Step 4: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add src/ui/scenarios/ScenarioListCard.tsx src/app/scenarios/page.tsx
git commit -m "feat(scenarios): add the cross-World Scenarios list page"
```

---

### Task 3: Mandates page

**Files:**
- Create: `src/ui/scenarios/MandateCard.tsx`
- Create: `src/app/mandates/page.tsx`

**Interfaces:**
- Consumes: `loadPacks` (`@/lib/summaries`); `checksByDimension` (`@/ui/worlds/packView`, already
  exported and tested); `Scenario` type (`@/engine/pack`); `ConsoleShell`; `heading`/`serif`
  (`@/ui/styles`).
- Produces: nothing consumed elsewhere — a leaf list page. This is the last task in the plan; once it
  lands, Task 1's Sidebar `/mandates` link resolves to a real page.

- [ ] **Step 1: `MandateCard.tsx`**

```tsx
// One card on the Mandates library: a Scenario's Policy, quoted, with the Dimensions its Checks
// score against and a link to the full Scenario. Purely derived — no new data, no persistence.
import Link from "next/link";
import type { Scenario } from "@/engine/pack";
import { serif } from "@/ui/styles";
import { checksByDimension } from "@/ui/worlds/packView";

export function MandateCard({ packId, packName, scenario }: { packId: string; packName: string; scenario: Scenario }) {
  const groups = checksByDimension(scenario.checks);
  return (
    <div className="bg-white border border-[#E3E0D5] rounded-lg p-4.5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className={`${serif} text-[16px] font-semibold`}>{scenario.title}</h2>
        <span className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">{packName}</span>
      </div>
      <div className="bg-[#F7F5EF] border border-[#E3E0D5] border-l-[3px] border-l-[#1B1A17] rounded-r-lg px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-line">
        {scenario.policy.text.trim()}
      </div>
      <div className="flex gap-1.5 flex-wrap">
        {groups.map((g) => (
          <span key={g.dimension} className="text-[10.5px] text-[#6E6B60] bg-[#F7F5EF] border border-[#E3E0D5] rounded-full px-2 py-0.5">
            {g.checks.length} × {g.label}
          </span>
        ))}
      </div>
      <Link
        href={`/scenarios/${encodeURIComponent(packId)}/${encodeURIComponent(scenario.id)}`}
        className="text-[12px] font-semibold text-[#1B1A17] underline decoration-dotted self-start"
      >
        View full Scenario →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: `src/app/mandates/page.tsx`**

```tsx
import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { serif } from "@/ui/styles";
import { MandateCard } from "@/ui/scenarios/MandateCard";

export const dynamic = "force-dynamic";

export default function MandatesPage() {
  const { packs } = loadPacks();
  const pairs = packs.flatMap((p) => p.scenarios.map((s) => ({ pack: p, scenario: s })));

  return (
    <ConsoleShell>
      <div className="p-4 flex flex-col gap-4 max-w-[900px]">
        <div className="text-xs text-[#6E6B60]">AgentSim</div>
        <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Mandates</h1>
        <p className="text-[13px] text-[#6E6B60] max-w-[70ch]">
          The Policy every Scenario carries, surfaced on its own — what every Check traces back to.
        </p>
        {pairs.length === 0 ? (
          <p className="text-[13px] text-[#6E6B60]">No Scenarios found across any installed World.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {pairs.map(({ pack, scenario }) => (
              <MandateCard key={`${pack.meta.id}::${scenario.id}`} packId={pack.meta.id} packName={pack.meta.name} scenario={scenario} />
            ))}
          </div>
        )}
      </div>
    </ConsoleShell>
  );
}
```

- [ ] **Step 3: Manual verification**

With the dev server running, visit `/mandates` and confirm every installed pack's Scenarios appear
with their Policy text quoted and correct Dimension-count tags (cross-check at least one Scenario's
tags against its Checks in `worldpacks/<pack>/scenarios/<scenario>.yaml`), and that "View full
Scenario →" navigates to the correct detail route from Task 1. Also click the sidebar's "Mandates"
and "Scenarios" links (added in Task 1) and confirm both now resolve to real pages, and that the
active-nav highlighting works on all three new routes. Stop the dev server when done.

- [ ] **Step 4: Run the full suite and `tsc`, commit**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add src/ui/scenarios/MandateCard.tsx src/app/mandates/page.tsx
git commit -m "feat(mandates): add the Mandates library page"
```

## Self-review

- **Placeholder scan**: none — every file's complete code is given; the two 404 conditions in Task
  1's detail route are both real, verified branches (pack-id validity, scenario-id membership), not
  placeholders.
- **Consistency**: `ScenarioCard`'s export (Task 1) is the only visibility change to existing code,
  and its signature is unchanged, so Task 1's detail route can call it exactly as `ScenarioCards`
  (the existing consumer) always has. `ScenarioListCard`/`MandateCard` (Tasks 2-3) both link to the
  exact route Task 1 creates (`/scenarios/:packId/:scenarioId`), same URL-building pattern
  (`encodeURIComponent` on both segments) in both places.
- **Scope**: 3 new route files, 2 new small components, 1 visibility change, 1 Sidebar array edit
  across 3 tasks. No engine changes, no new API routes, no new summary types — matches the spec's
  stated scope exactly.
