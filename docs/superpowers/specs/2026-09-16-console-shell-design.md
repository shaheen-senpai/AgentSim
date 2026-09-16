# AgentSim Console — Phase 1: Navigation Shell + Real Runs List

## Context

The user approved a full product redesign, designed and iterated as an HTML mockup
("AgentSim Console", published as a Claude Artifact — sidebar nav, a Runs list, a
git-diff-style Run comparison, a 6-step New Run wizard, and new World/Scenarios/Mandates
sections). That mockup is real-content-grounded but static — no backend, no routing, no
reuse of the app's actual, already-shipped components. Implementing the whole thing as one
plan would be unreviewable and risky. This spec covers only **Phase 1** of a five-phase
rollout:

1. **Navigation shell + real Runs list** (this spec)
2. New Run wizard (replaces the Launcher)
3. World section (reorganizes the existing pack pages)
4. Scenarios + Mandates (new, read-only, derived views)
5. Run comparison (extends the existing `/compare` page)

Each phase is independently shippable and gets its own plan. Phase 1's job: swap the
chrome from the old top `Header` to the new sidebar, and turn "Recent runs" — today a
12-row panel inside the Launcher's sidebar — into a real, full Runs list page. Nothing
else in the app changes behavior.

## Confirmed facts (verified against the current codebase, not assumed)

- `listRuns()` (`src/runner/store.ts:126`) already reads and returns **every** Run across
  `data/runs/` and `data/golden/` — `RecentRuns.tsx` is what caps it to 12 for display
  (`runs.slice(0, 12)`). The full-list page needs no new data-access function, only a
  `RunSummary` that carries enough to render the mockup's columns.
- `RunSummary` (`src/runner/store.ts:48-55`) currently carries only `headline` and
  `capped` — not the per-Dimension breakdown the mockup's table shows (Task/Mandate/
  Safety columns). `listRuns()` already reads each Run's full record (`readRunFile`) to
  build each summary, so adding `dimensions: DimensionScore[]` (from `run.score?.dimensions
  ?? []`, using the existing `DimensionScore = { name: Dimension; score: number; passed:
  number; total: number }` from `src/engine/evaluator.ts:12`) costs no new I/O.
- `src/app/page.tsx` today renders `RunPage` with `id: null` — the Launcher-only "empty"
  experience. This becomes the new `/runs/new` route's content (unchanged), freeing `/`
  for the new Runs list.
- `Header.tsx` has two responsibilities today: persistent top nav (Runs/Worlds/Connect)
  and, when a Run is active, a context strip (pack/agent/attack pills + Scenario title).
  The sidebar takes over the first; the second moves into the Run detail page's own body
  (matching the mockup), not into the sidebar.
- `World` already has a real page (`/worlds`) — it goes on the sidebar in Phase 1,
  unchanged, not yet restyled into the mockup's tabs (that's Phase 3). `Mandates` and
  `Scenarios` have no standalone page yet — they are **not** added to the sidebar in
  Phase 1 (linking them to nothing would be worse than the mockup's "show everything"
  promise); they appear in Phase 4 once real pages exist.
- `/connect` (BYO agent pre-registration) is not part of the mockup's sidebar and keeps
  working, reachable the same way it is today (its own page, no sidebar entry) — the
  wizard (Phase 2) is where it gets a natural link out.

## Design

### Token system: reuse, not reinvent

Phase 1 introduces no new colors, type, or spacing — it uses exactly the warm-monochrome
tokens already shipped in `src/ui/styles.ts` (`panel`, `heading`, `mono`, `serif`,
`dangerPill`, `primaryButton`, etc.) and the mockup's sidebar visual language translated
into these same tokens (cream sidebar background one shade off the page background, the
black active-pill nav state, the underline-on-hover the flagship pass already established
for top nav — carried down into the sidebar's vertical list).

### Components

**`src/ui/Sidebar.tsx`** (new) — replaces `Header.tsx`'s persistent-nav role. Fixed-width
left column: wordmark, a vertical nav list (`Runs` → `/`, `World` → `/worlds`), and a
bottom status block (reuses the same "no dedicated status data exists yet" honesty the
current app already has — this block shows nothing invented; if there's nothing real to
show, it's omitted rather than faked). `usePathname()`-driven active state, same pattern
`Header.tsx` already uses for `isCurrentSection`.

**`src/ui/ConsoleShell.tsx`** (new) — the layout wrapper: `Sidebar` + a main content slot.
Every page below renders inside this instead of directly under `Header`.

**`src/ui/RunsListPage.tsx`** (new) — the real Runs list: a table (Run / Scenario / Attack
/ Agent / Task / Mandate / Safety / World / Verdict / When, using the newly-carried
`dimensions` data) plus the mockup's three insight cards, ported faithfully — except the
"Compare" card links to the existing `/compare` route with the two most-recent runs of the
same Scenario+different-Agent pair when one exists, and is otherwise omitted (Phase 1 does
not build new comparison logic; that is Phase 5). Rows navigate to `/runs/:id`, unchanged.

**Existing components — touched, not rebuilt:** `RunPage.tsx`/`RunView.tsx` keep every
piece of behavior (Launcher rail, `FlowView`, `Timeline`, `ScorePanel`, `DiffPanel`,
`EventDrawer`, replay) exactly as-is. The only change: the JSX that today renders
`<Header run={displayRun} />` at the top renders `<ConsoleShell>` around the whole page,
and the pack/agent/attack/Scenario-title strip (today inside `Header`) moves to render
once, inside `RunView`'s own top area, using the exact same data it already receives —
no new props, no new data fetching.

### Data flow

`listRuns()` → extended `RunSummary[]` (now carrying `dimensions`) → `src/app/page.tsx`
(rewritten to render `RunsListPage`, not `RunPage`) → `RunsListPage` renders the table
client-side from the array the server component already fetched. No new API routes; no
change to how a Run is created, polled, or scored.

### Routing changes

| Route | Before | After |
|---|---|---|
| `/` | `RunPage` with `id: null` (Launcher + empty canvas) | `RunsListPage` (new) |
| `/runs/new` | did not exist | `RunPage` with `id: null` — today's exact `/` content, moved |
| `/runs/:id` | `RunPage` with a real Run | unchanged, now inside `ConsoleShell` |
| `/worlds`, `/worlds/:id`, `/connect`, `/compare`, `/mcp/*`, `/api/*` | unchanged | unchanged |

### Out of scope for Phase 1

The wizard, World's new tab structure, Scenarios, Mandates, and the ledger-diff Compare
view are explicitly later phases — nothing here blocks them, and nothing here anticipates
their data model (in particular, no new "Mandate" or cross-Scenario data structure is
introduced now).

## Self-review

- **Placeholder scan**: none — every field/route/component named above is either verified
  against the current codebase or explicitly marked as new with its exact responsibility.
- **Consistency**: the routing table and the "Confirmed facts" section agree; the
  `RunSummary` extension is the only data-shape change, and it's additive (no existing
  consumer of `RunSummary` breaks — `RecentRuns.tsx` keeps working unmodified, it simply
  ignores the new `dimensions` field it doesn't read).
- **Scope**: small enough for one implementation plan — 3 new files, 2-3 modified files,
  one data-shape extension, no new backend logic.
