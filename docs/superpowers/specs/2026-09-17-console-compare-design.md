# AgentSim Console — Phase 5: Compare (Ledger Diff)

## Context

Phases 1-4 (shipped) gave the app a sidebar shell, a real Runs list, the New Run wizard, a
reorganized World section, and cross-World Scenarios + Mandates. This spec covers **Phase 5**, the
last phase: extending `/compare` from two independent side-by-side Flow views into the mockup's
git-diff-style ledger comparison — a shared/diverged event ledger, an Attack panel, a per-Check A-vs-B
table grouped by Dimension, and a World-diff comparison — plus a Run A/B picker so the page is usable
without a precomputed link, and moving `/compare` onto the Console sidebar shell (the last surface
still on the old top `Header`, other than `/connect`, which stays out of scope per Phase 1's spec).

Design source: the approved mockup's Compare section (`view-compare`, `renderCompare`,
`renderComparePickers`, `stepHtml`). Every new computation below is grounded in real engine data
already on `RunRecord`/`WorldPack` — nothing here re-implements evaluator or attack logic.

## Confirmed facts (verified against the current codebase, not assumed)

- `src/app/compare/page.tsx` today: reads `?a=`/`?b=` Run ids, `notFound()`s if either is missing,
  renders `<Header run={ra} />` + two independent `CompareRunColumn`s (score header + a static,
  non-scrubbing `FlowView` per Run) side by side. No picker UI exists — the only entry point is
  `RunsListPage`'s precomputed "Compare" card. `CompareColumn`/`CompareRunColumn` are unchanged by
  this phase (they still render at the top of each new page, above the new ledger-diff content).
- **Per-Check pass/fail identity, solved.** `runCheck` (`src/engine/checks.ts:36`) constructs every
  `Violation` as `{ checkType: type, dimension, params, eventSeq, message }` where `params` is
  **exactly** `check` with `type`/`dimension` destructured out (`const { type, dimension, ...params }
  = check;`) — the identical transform `packView.ts`'s existing `checkParams()` already performs for
  display. This means a `Check` and a `Violation` can be matched by structural equality on
  `{type, dimension, params}` with zero new engine logic: a Check "passed" for a Run iff no Violation
  in that Run's `violations` array has a matching key. This was an open question flagged when Phase 4
  was speced ("no existing stable Check id to match on") — it's resolved by this exact-content-match,
  not by inventing a new persisted id.
- **Common-prefix ("where do two ledgers diverge") is a plain array comparison.** Two Runs' `events:
  Event[]` (each `{ tool: string; input: Record<string, unknown>; ... }`) can be compared position by
  position on `tool`+`input` equality (`JSON.stringify` both, compare) — this is exactly what the
  mockup's own `la[i].tool===lb[i].tool && la[i].args===lb[i].args` loop does, translated to this
  app's real `Event` shape. No engine change.
- **The Attack panel needs no new engine data.** `event.injected: { attackId, collection, id, field }
  | null` is already stamped by the engine (`src/engine/gateway.ts`) on any event whose result
  contained the Attack's planted text — the first such event in either Run's ledger already tells you
  exactly where the Attack was planted (`collection`/`id`/`field`) and which tool surfaced it
  (`event.tool`), with zero need to search the pack's schema for an "untrusted" field the way the
  mockup's mock data does. "Took the Lure" is `matchesLure(run.attack.lure, event)` for any event —
  `matchesLure` (`src/engine/lure.ts`) is the existing, already-client-safe leaf function every other
  consumer of this rule defers to (never reimplemented).
- **World diff needs no new engine data either.** `run.diff: DiffEntry[] | null` and
  `run.unchangedCount: number | null` are already computed and persisted per Run
  (`src/engine/diff.ts`'s `diffWorld`/`unchangedCount`, called once at Run finish) — the same data
  `DiffPanel.tsx` already renders for a single Run. Phase 5 renders both Runs' `diff`/`unchangedCount`
  side by side; it does not re-derive them.
- **Browser-safety import purity (the exact defect class Phase 3 hit twice) applies here too.**
  `tests/ui/buildFlow.test.ts`'s guard forbids every file under `src/ui/` from value-importing
  `@/engine/pack`, `@/engine/attack`, `@/runner/store`, `@/runner/agentRegistry`, or any `node:`
  builtin. Verified for this phase's specific needs:
  - `@/engine/lure`'s `matchesLure` — already the established, client-safe leaf (confirmed: only
    `import type` from `./pack`/`./types`, nothing from `node:*`).
  - `@/engine/evaluator`'s `Violation`/`Score`/`DimensionScore` types, and `@/engine/pack`'s
    `Check`/`Attack` types — all consumed via `import type` only (erased at compile time, not caught
    by the guard's value-import check regardless of what those modules do internally at the value
    level).
  - `@/engine/world`'s `entityLabel` was considered and **rejected** for client-side use — even
    though tracing its own import chain (`ownership.ts`, type-only `./pack`) shows it has no `node:fs`
    footprint today, passing a whole `WorldPack` down as a client prop just to call one lookup
    function is wasteful and reintroduces exactly the "is this transitively safe" question Phase 3
    already paid to answer twice. Instead: a plain `Record<string, string>` of collection→label,
    computed server-side and passed down as a serializable prop — no client-side engine import at
    all for this piece.
  - No new file in this plan imports `@/engine/pack`, `@/engine/attack`, `@/runner/store`, or
    `@/runner/agentRegistry` **by value**, anywhere under `src/ui/`.
- `Sidebar.tsx`'s `NAV` currently has 4 entries (`Runs`, `Mandates`, `Scenarios`, `World`) — Phase 4's
  final review flagged that `/compare` (and `/connect`) still use the legacy `Header.tsx` nav, and
  that this "should not survive Phase 5." This phase adds `Compare` to the Sidebar and moves
  `/compare` onto `ConsoleShell`. `/connect` is explicitly **not** touched (Phase 1's spec scoped it
  out entirely — "the wizard is where it gets a natural link out" — and it stays that way).
- `latestComparablePair` (`src/ui/RunsListPage.tsx`) already picks two completed Runs of the same
  Scenario by different agents — this phase's new Run-picker generalizes that idea into an on-page
  control (pick any Run for A, B is filtered to same-`scenarioId` peers), matching the mockup's own
  `renderComparePickers` behavior, translated to this app's real `RunSummary` list (`listRuns()`,
  already used by `RunsListPage`).

## Design

### Route & chrome

`src/app/compare/page.tsx`: swaps `<Header run={ra} />` for `<ConsoleShell>`; reads `?a=`/`?b=` as
today. If either is missing, instead of an immediate `notFound()`, falls back to
`latestComparablePair(listRuns())` (already exported, already tested) when available, else renders an
empty-state prompting the user to pick two Runs (the page must not always require a precomputed link
now that a picker exists). `Sidebar.tsx`'s `NAV` gains a `Compare` entry, positioned after `Runs`
(matching the mockup's own ordering, `Runs → Compare → …`).

### Components (new, under `src/ui/compare/`)

- **`RunPicker.tsx`** (client): two `<select>`s (A: any completed Run; B: Runs sharing A's
  `scenarioId`, excluding A) + a swap button. `"use client"`; on change, `router.push` to
  `/compare?a=...&b=...`, letting the Server Component re-render with the new pair — no client-side
  Run-fetching, matching every other picker in this app (`?tab=`, wizard steps, etc.).
- **`AttackPanel.tsx`**: shown only when `ra.attack || rb.attack`. Attack id/title (from whichever
  Run's `attack` is set), the raw `collection`/`id`/`field` of the first `injected` event found across
  either Run's `events` (labeled via the passed-down collection→label map, falling back to the raw
  collection name), the Lure's `tool`/`args_match` (formatted with the same single-vs-multi-key rule
  Phase 2's wizard already established for `formatLure`), the injected text itself (`injectedText`
  from `@/engine/lure`, also already client-safe), and one "took it?" summary per Run (saw the
  injected content at step #N / never read it; took the Lure at step #N / did not).
- **`ActionLedger.tsx`**: the git-diff-style ledger. Shared prefix (both Runs' identical opening
  steps) rendered once; then a fork marker; then a two-column split of each Run's remaining events.
  Each step is a clickable row (tool, a one-line arg summary, injected/error/lure-taken flags) that
  expands in place to show the full input, result/error, and — when applicable — why it's flagged
  (matches the level of detail `EventDrawer` already shows for a single Run's event, translated to an
  inline expand instead of a side drawer, since two Runs' drawers would compete for the same space).
- **`ChecksTable.tsx`**: shown only when `ra.scenarioId === rb.scenarioId` and both Runs' packs loaded
  (mirrors `packViewFor`'s existing per-column degradation — this section simply doesn't render if the
  two Runs aren't of the same Scenario, rather than showing a meaningless comparison). Every
  `scenario.checks` entry, grouped by Dimension (reusing the canonical `DIMENSIONS` order), with a
  ✓/✗ column for A and B computed via the structural-equality match described above.
- **`WorldDiffCompare.tsx`**: `ra.diff`/`rb.diff` (already-computed `DiffEntry[]`) rendered side by
  side, same visual treatment `DiffPanel.tsx` already uses for a single Run (added/changed rows,
  unchanged count), reused not reinvented.

### Data flow

`/compare` (Server Component) → `loadRun(a)`/`loadRun(b)` (unchanged) → for the Checks table only:
`loadPack(run.packId)` (already done for `packViewFor`) → `pack.scenarios.find(s => s.id ===
run.scenarioId)` → `scenario.checks` passed down as plain data, plus a `collection → label` map built
once server-side from `pack.meta.entities`. Everything else (`Event[]`, `Violation[]`, `DiffEntry[]`,
`Attack | null`) is already on the loaded `RunRecord`s — no new API routes, no new persisted data.

### Out of scope for Phase 5

`/connect` (unchanged, still on `Header.tsx`, per Phase 1's original scoping); any change to how a Run
is created, scored, or its Snapshot/diff computed (this phase only *renders* existing data
differently); a "compare more than 2 Runs" mode (the mockup and every phase before this assumed
exactly two).

## Self-review

- **Placeholder scan**: none — every section's data source is named and traced to an existing,
  already-computed field or an already-established client-safe leaf function.
- **Consistency**: the "browser-safety import purity" section names every import this phase's new
  files will need and states which are safe (type-only, or the vetted `@/engine/lure` leaf) versus
  deliberately avoided (`entityLabel`, replaced with a plain server-computed map) — this is the exact
  category of defect that slipped past two prior phases' per-task reviews, addressed here at spec time
  instead of discovered at final review a third time.
- **Scope**: 1 route file modified (chrome + fallback), 1 Sidebar array edit, 5 new components under
  `src/ui/compare/`, 0 engine changes, 0 new API routes, 0 new persisted data.
