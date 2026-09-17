# AgentSim Console — Phase 4: Scenarios + Mandates

## Context

Phases 1-3 (shipped) gave the app a sidebar shell, a real Runs list, the New Run wizard, and a
reorganized World section. This spec covers **Phase 4**: the two sidebar nav items deliberately
withheld since Phase 1 ("linking them to nothing would be worse than the mockup's 'show everything'
promise") — **Scenarios** (a cross-World list + detail, aggregating every Scenario across every
installed pack) and **Mandates** (a read-only library view over every Scenario's Policy). Both are
derived views over data that already exists; neither introduces a new data model.

Design source: the approved mockup's Scenarios section (`view-scenarios`, `renderScenarioCards`,
`renderScenarioDetail`) and Mandates section (`view-mandates`, `renderMandates`).

## Confirmed facts (verified against the current codebase, not assumed)

- `src/ui/worlds/ScenarioCards.tsx`'s private `ScenarioCard` function already renders, for one
  Scenario: Task Brief, Policy (as a quoted block), Checks grouped by Dimension (via
  `checksByDimension` from `packView.ts`), and Attacks with their Lure (via a private `AttackCard`),
  plus a "▷ Run this" link (`runHref(packId, scenarioId)`) — this is the exact content the mockup's
  Scenario detail view shows, already built and already reviewed. It is not currently exported.
- `src/app/worlds/[id]/page.tsx`'s pattern for a not-found/invalid id (`PACK_ID_RE.test(id) &&
  listPackIds().includes(id)`, else `notFound()`) is the established, reusable pattern for validating
  a route param against installed packs before calling `loadPack`.
- `loadPacks()` (`src/lib/summaries.ts`) already returns every installed `WorldPack` (skipping ones
  that fail to load, with `broken` reported separately) — the cross-World aggregation Phase 4 needs is
  `loadPacks().packs.flatMap(p => p.scenarios.map(s => ({ pack: p, scenario: s })))`, no new
  data-access function required.
- `Scenario.id` values in this repo are plain kebab-case strings (`duplicate-charge-refund`,
  `mfa-reset-with-manager-approval`, etc.) — safe as URL path segments; no id-format regex exists for
  Scenario ids today (unlike `PACK_ID_RE` for packs), so Phase 4's detail route validates a Scenario id
  by membership in the loaded pack's `scenarios` array (mirroring the pack-id validation pattern, one
  level down), not by a new regex.
- `src/ui/Sidebar.tsx`'s `NAV` array currently has 2 entries (`Runs`, `World`) — Phase 1's spec
  explicitly deferred `Scenarios`/`Mandates` "until real pages exist" (Phase 4, this spec) and left
  `Compare` out of the sidebar entirely (still Phase 5's decision). The mockup's own sidebar order is
  Runs → Compare → New run → Mandates → Scenarios → World; this app's reduced nav (no Compare, no New
  run — reachable via the Runs page's button, not the sidebar) inserts `Mandates` then `Scenarios`
  between `Runs` and `World`, preserving the mockup's relative Mandates-before-Scenarios ordering.
- `ConsoleShell`/`Sidebar` (Phase 1) are the established chrome for every new page from here on —
  `Header.tsx` is now used only by `/compare` and `/connect` (confirmed by grep), neither touched by
  this phase.
- `checksByDimension`, `runHref` (`src/ui/worlds/packView.ts`) are pure, already-tested helpers reused
  as-is by both the existing World Scenarios tab and this phase's new pages.

## Design

### Routes

| Route | Renders |
|---|---|
| `/scenarios` | List: every Scenario across every installed pack, as a compact card (title, task brief, World name, Checks count, Attacks count), linking to the detail route. |
| `/scenarios/:packId/:scenarioId` | Detail: the exact `ScenarioCard` content (Task Brief/Policy/Checks-by-Dimension/Attacks/"▷ Run this"), exported and reused from `ScenarioCards.tsx`, plus a "World: {pack.name}" line and a back link to `/scenarios`. 404s if `packId` isn't installed or `scenarioId` doesn't belong to it (mirrors `/worlds/[id]`'s validate-before-load pattern, one level down). |
| `/mandates` | List only, no detail route: every Scenario's Policy as a quoted block, with Dimension-count tags (`${n} × ${DimensionLabel}`) and a "View full Scenario →" link to `/scenarios/:packId/:scenarioId`. Purely derived — no new data, no new persistence. |

### Components

- **`ScenarioCards.tsx`**: `ScenarioCard` becomes exported (rename not required — same function, same
  signature `{ packId, scenario }`, just no longer file-private). `ScenarioCards` (plural) is
  unchanged, still the World Scenarios tab's renderer, and now internally maps over the exported
  `ScenarioCard` (no behavior change — it already did this, the only change is visibility).
- **`src/ui/scenarios/ScenarioListCard.tsx`** (new): the compact list-card — title (serif, matching
  the mockup's `sc-card h3`), task brief (one line, truncated via `packView.ts`'s existing `truncate`),
  a World-name tag, and Checks/Attacks count tags (`mini-tag`-equivalent styling, reusing the warm
  Console tokens). Links to `/scenarios/:packId/:scenarioId`.
- **`src/ui/scenarios/MandateCard.tsx`** (new): Scenario title + World-name tag, the Policy text in
  the same quoted-block style `MandateStep.tsx` (Phase 2) already established, Dimension-count tags
  (via `checksByDimension`), and the "View full Scenario →" link.

### Sidebar

`src/ui/Sidebar.tsx`'s `NAV` becomes:
```ts
const NAV = [
  { href: "/", label: "Runs" },
  { href: "/mandates", label: "Mandates" },
  { href: "/scenarios", label: "Scenarios" },
  { href: "/worlds", label: "World" },
];
```

### Data flow

`/scenarios` and `/mandates`: `loadPacks().packs.flatMap(...)` → plain `{pack, scenario}` pairs,
server-rendered, no client state. `/scenarios/:packId/:scenarioId`: `loadPack(packId)` (existing,
throws/validated the same way `/worlds/[id]` already handles) → find the scenario → render the reused
`ScenarioCard`. No new API routes, no new summary types in `src/lib/summaries.ts` (this phase reads
`WorldPack`/`Scenario` directly, server-side, unlike Phase 2's wizard which needed a richer summary for
client-side consumption — these pages are Server Components throughout, so no such translation layer
is needed).

### Out of scope for Phase 4

Adding `Compare` to the sidebar (Phase 5's call); any new Scenario-authoring/editing UI (Scenarios
remains a read-only derived view; authoring a Scenario still happens on `/worlds/:id`'s existing
Scenarios tab, via `PackEditor`'s "+ Add scenario"); the ledger-diff Compare view itself (Phase 5).

## Self-review

- **Placeholder scan**: none — every route's content is named against an existing, already-reviewed
  component (`ScenarioCard`) or a small new one whose exact content is specified.
- **Consistency**: the routing table and "Confirmed facts" agree; `ScenarioCard`'s export is the only
  change to already-shipped code, and it's a visibility change only (no signature or behavior change).
- **Scope**: 3 new route files, 2 new small components, 1 visibility change (`export` keyword) to an
  existing function, 1 Sidebar array update. No engine changes, no new API routes, no new summary
  types.
