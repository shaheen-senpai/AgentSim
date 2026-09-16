# AgentSim Console — Phase 3: World Section

## Context

Phases 1-2 (shipped/in progress) gave the app a sidebar shell, a real Runs list, and the New Run
wizard. This spec covers **Phase 3**: reorganizing the existing, already-working World pages
(`/worlds`, `/worlds/:id`, `/worlds/new`) to match the mockup's Overview / Entities / Tools /
Scenarios tab structure, moving them onto `ConsoleShell`, and migrating `src/ui/worlds/*` off its
own hand-rolled color palette onto the shared `src/ui/styles.ts` tokens Phases 1-2 established.

Design source: the approved mockup's World section (`view-world`, `renderWorldDetail`,
`renderEntitiesTab`, `renderToolsTab`). Where the mockup shows data this app's `WorldPack` does not
persist (see below), this spec says exactly what real behavior replaces it — no invented data.

## Confirmed facts (verified against the current codebase, not assumed)

- Today's tab set (`WORLD_TABS`, `src/ui/worlds/packView.ts:9`) is
  `["overview", "seed", "tools", "scenarios", "agents"]`, rendered by `Body({pack,tab})`
  (`src/app/worlds/[id]/page.tsx:25-39`) switching to `EntityMap` | `SeedTables` | `ToolCards` |
  `ScenarioCards` | `AgentPrompts`, inside `PackEditor` (owns the tab strip via `PackTabs`, a
  Validate/Save toolbar, and per-tab "Edit YAML" toggling — unchanged by this phase).
- `EntityMap.tsx` (Overview tab) already draws a real entity-relationship SVG (ownership arrows,
  principal marker, untrusted fields listed per box) plus a Systems chip list — this is the app's
  real "what is this World made of" view. **The mockup's Overview tab instead lists "sources"**
  (third-party MCPs shadowed, databases mocked, etc., each with a mode label) — **this data does not
  exist on a `WorldPack` once saved** (confirmed: `PackMeta`/`WorldPack` carry no source-provenance
  field; "sources" only exist transiently in `/worlds/new`'s in-memory generation draft, never
  persisted). Inventing a fake "sources" list to match the mockup would violate this project's own
  standing rule (Phase 1's Sidebar precedent: "if there's nothing real to show, it's omitted rather
  than faked"). **Decision: Overview keeps `EntityMap`'s real SVG + Systems + principal content**,
  re-skinned to the shared tokens — not rebuilt as a sources list.
- `SeedTables.tsx` (today's separate "Seed" tab) renders one full table per collection, all
  collections at once, capped at `SEED_ROW_LIMIT` rows each, using `previewRows`/`cellText` from
  `packView.ts`. The mockup's **Entities** tab is a single-entity drill-down (a left rail of entity
  names + the selected entity's field defs and seed rows, one at a time) with an "as seeded / under
  Attack" toggle. This phase **merges Seed into Entities**: the tab set becomes
  `["overview", "entities", "tools", "scenarios", "agents"]` — five tabs (`agents` — Reference Agent
  prompts — has no mockup equivalent; it is real, working, already-shipped content with nowhere else
  to live, so it is kept as a fifth tab appended after the mockup's four, not dropped).
- The "under Attack" seed preview needs to compute what an Attack's `Mutation` does to seed data
  before any Run exists. The exact, already-working function for this: `seedWorld(pack)` builds the
  initial `World` from `pack.seed` (`src/engine/world.ts:8`); `applyAttack(pack, world, attack)`
  (`src/engine/attack.ts:16`) mutates that `World` in place per `attack.mutation` — the same function
  a real Run calls before its start Snapshot. Reused directly, not reimplemented: clone the seeded
  World (`structuredClone` or an equivalent deep copy — the real `World`/`Row` shape is JSON-safe,
  confirmed by `src/engine/types.ts:1,4-5`), call `applyAttack` on the clone, read the result.
- A pack can have more than one Scenario, and a Scenario can have more than one Attack (today's 3
  installed packs each have exactly one Scenario with one Attack, per `worldpacks/`, but the pack
  format does not require that). The mockup's toggle hardcodes "the first Scenario's first Attack" —
  this spec generalizes: collect every distinct `Attack` across every Scenario in the pack
  (`Attack.id` is unique per Scenario per the pack schema, but two different Scenarios could reuse an
  id — dedupe by `scenario.id + "::" + attack.id`); if none exist, the Entities tab shows only "as
  seeded" (no toggle); if any exist, add a `<select>` of `"as seeded"` + one option per distinct
  Attack (labeled `${attack.id} (${scenario.title})` when more than one Scenario contributes attacks,
  else just `${attack.id}`).
- `ToolCards.tsx` (Tools tab) already renders a card grid — system color stripe, kind pill,
  input-field chips, guards (verbatim `when`/`error`), returns as pretty-printed JSON — using
  `systemColor`/`fieldLabel`/`opLabel` from `packView.ts`/`src/ui/systemColor.ts`. The mockup's Tools
  tab uses a rail + hover/click schema pane instead. **Decision: keep the existing card-grid layout**
  (it shows every tool's guards/schema at once, no hover-only content — strictly more accessible and
  already real/tested) and re-skin its colors to the shared tokens, rather than rebuild as a
  rail+pane to chase the mockup's exact layout. This is a deliberate, named deviation from the
  mockup's pixel layout for this one tab, not a silent one.
- `ScenarioCards.tsx` (Scenarios tab) already renders, per Scenario: Task Brief, Policy, Checks
  grouped by Dimension (`checksByDimension` from `packView.ts`), and Attacks with their Lure
  (`lureSummary`/`mutationSummary`/`mutationText`) — this already matches the mockup's Scenarios tab
  content closely. Only the color tokens need migrating; the structure stays.
- Color migration scope: `src/ui/worlds/*` and `src/ui/connect/*`'s hand-rolled hex values
  (`#1d1d1b`→`#1B1A17`, `#6b6b66`→`#6E6B60`, `#cfcfcb`→`#E3E0D5`, `#c8321e`→`#B23A22`,
  `#fbeeea`→`#FBEAE7`, `#f4f4f2`→`#F7F5EF`) map one-to-one onto tokens already in `src/ui/styles.ts`
  (`panel`, `mono`, `heading`, `dangerFg`, `dangerBg`). This phase migrates `src/ui/worlds/*` (the
  files this phase touches for the tab reorg anyway); `src/ui/connect/*` is out of scope (untouched
  since Phase 1/2, no reason to touch it here — a future phase can do it when `/connect` itself moves
  onto `ConsoleShell`).
- `/worlds`, `/worlds/[id]`, `/worlds/new` currently render `<Header run={null} />` + a plain
  `<main>`, not `<ConsoleShell>` (confirmed: `ConsoleShell` grep hits only `RunView.tsx` and
  `src/app/page.tsx` before this phase). Phase 1's spec explicitly deferred this
  ("`World`... goes on the sidebar in Phase 1, unchanged, not yet restyled into the mockup's tabs
  (that's Phase 3)"). This phase moves all three onto `ConsoleShell`, dropping `Header` for them.
- `Sidebar.tsx`'s `NAV` (`src/ui/Sidebar.tsx:6-9`) label is `"World"` (singular) — already correct,
  no change needed there.
- `PackEditor.tsx`'s Validate/Save toolbar, YAML-edit toggling, and scenario add/delete are unchanged
  by this phase — Phase 3 only touches tab content and chrome, not the editing mechanics.

## Design

### Route/chrome changes

`src/app/worlds/page.tsx`, `src/app/worlds/[id]/page.tsx`, `src/app/worlds/new/page.tsx`: replace
`<Header run={null} />` + `<main>` with `<ConsoleShell>` wrapping the existing page body. No other
change to these three page files beyond that chrome swap and (for `[id]/page.tsx`) the tab set below.

### Tab set

`WORLD_TABS` (`packView.ts:9`) becomes `["overview", "entities", "tools", "scenarios", "agents"]`.
`Body({pack, tab})` (`src/app/worlds/[id]/page.tsx`) routes `"entities"` to the new `EntityBrowser`
component (below) instead of `SeedTables`; `"overview"` still routes to `EntityMap` (re-skinned);
`"tools"`/`"scenarios"`/`"agents"` unchanged except re-skinned. `SeedTables.tsx` is deleted — its
`previewRows`/`cellText` helpers (`packView.ts`) are reused by `EntityBrowser`, not duplicated.

### `src/ui/worlds/EntityBrowser.tsx` (new — replaces `SeedTables.tsx`)

Left rail: one button per entity (name, row count) — same interaction pattern as `PackTabs`'
Link-or-button dual mode is not needed here (this is in-tab state, not a route), so plain local
`useState<string>` for the selected entity name, defaulting to the pack's principal entity.

Right pane, for the selected entity: field table (name, type, untrusted marker — reusing
`SeedTables`' exact untrusted-dot pattern), an "as seeded" / per-Attack `<select>` (per Confirmed
Facts above; omitted entirely when the pack has zero Attacks across all Scenarios), and the seed rows
table for the selected mode — reusing `previewRows`/`cellText` from `packView.ts` exactly as
`SeedTables.tsx` did, just scoped to one entity's rows (computed via `seedWorld(pack)` /
`applyAttack` for the "under Attack" mode's row set, `pack.seed.rows[name]` directly for "as seeded").
A row inserted by the previewed Attack's mutation (`insert_row`) is visually flagged (reuse the
`dangerBg` token as a row background) since the mockup marks planted rows distinctly.

### Token migration

`EntityMap.tsx`, `ToolCards.tsx`, `ScenarioCards.tsx`, `AgentPrompts.tsx`, `PackCard.tsx`,
`PackTabs.tsx`, `PackEditor.tsx`, `NewWorld.tsx`, `YamlEditor.tsx`: every hand-rolled hex listed above
replaced by the matching `src/ui/styles.ts` token or its exact hex value (importing the token where
the file already imports from `@/ui/styles`, using the literal hex only where a Tailwind arbitrary
value needs it inline — same pattern Phase 1/2 already established). No visual change beyond color —
layout, spacing, and copy are untouched except where the tab reorg (above) requires it.

### Out of scope for Phase 3

`/connect`'s color palette (separate future cleanup); a rebuilt Tools rail+pane (deliberately kept as
today's card grid, see Confirmed Facts); any new World-creation flow (`/worlds/new`'s three modes are
unchanged beyond chrome/colors); Scenarios/Mandates as cross-World pages (Phase 4); Compare (Phase 5).

## Self-review

- **Placeholder scan**: none — every tab's content source is named, and the two places the mockup
  shows data this app doesn't have (Overview's "sources" list, Entities' single-hardcoded-Attack
  assumption) are resolved with a stated, reasoned real-data decision, not a placeholder.
- **Consistency**: the tab-set change (`packView.ts`) and the routing change (`[id]/page.tsx`) name
  the same five tabs in the same order; `EntityBrowser` reuses `packView.ts`'s existing
  `previewRows`/`cellText` rather than redefining them, so there is one seed-row-formatting
  implementation, not two.
- **Scope**: reorganizes and re-skins ~9 existing files, adds 1 new file (`EntityBrowser.tsx`,
  replacing `SeedTables.tsx` which is deleted), touches 3 route files for `ConsoleShell` chrome. No
  engine changes — `seedWorld`/`applyAttack` are consumed exactly as they exist today.
