# AgentSim Console — Redesign to `design/agentsim-console.html`

**Date** 2026-09-17 · **Status** Approved in shape, spec under review · **Design source** `design/agentsim-console.html`

## 1. Context

The product owner revamped the console's flow and look in a self-contained HTML mock
(`design/agentsim-console.html`, 2454 lines: CSS, HTML shell, and an in-page JS "app" over
hand-written sample data). This spec turns that mock into the real console, wired to the backend
that already exists. The previous console phases (shell, wizard, world, scenarios/mandates,
compare) are superseded: their specs stay in `docs/superpowers/specs/` as history, but nothing in
them is a requirement any more. The mock is the requirement; the backend is the truth.

The mock is a single-page app with five views. The real console is a Next.js app; each mock view
maps onto a route. Every number, name and row the mock hard-codes must come from real data, or be
left out — no fake data ships.

## 2. Confirmed facts (verified against the code, not assumed)

- **Runs.** `listRuns()` → `RunSummary` (id, createdAt, status, packId, scenarioId, agentLabel,
  agentKind, attackId, headline, capped, golden, dimensions, outcome, passed). `RunRecord` also
  carries `packName`, `scenarioTitle`, `violations`, `events`, `score`, `diff`, `unchangedCount`,
  `narrative`, `taskBrief`, `idleTimeoutMs`, `finishedBy`, `attack`. There is no stored run
  *name*.
- **Score.** `Score` = headline, capped, capReason, passed, passReason, outcome
  (`completed | incomplete | refused | violated | abandoned`), outcomeReason, dimensions
  (`name, score, passed, total`). The cap is 40. `scoreSummary(score)` and `outcomeBadge()` in
  `src/ui/format.ts` already word these.
- **Events.** `Event` = seq, toolUseId, tool, input, result?, error?, isError, changes, startedAt,
  endedAt, source, batchId, injected (`{attackId, collection, id, field} | null`).
  `groupWaves(events)` (`src/ui/flow/buildFlow.ts`) groups concurrent calls by shared `batchId` or
  wall-clock overlap; `matchesLure(lure, event)` and `injectedText(attack)` live in the
  browser-safe leaf `src/engine/lure.ts`; `locateInjection()` in `src/ui/flow/injected.ts`.
- **Live runs.** A Reference Agent run drives itself to completion. A BYO run stays `running`
  until `POST /api/runs/:id/finish`, the agent says so, or the idle timer fires
  (`idleTimeoutMs`, default 2 min). `useRun(id)` polls `GET /api/runs/:id` while running.
  `POST /api/runs` returns `{ id, url, mcpUrl, mcpUrls, callUrl, taskBrief }` with one MCP URL per
  system. `useOrigin()` re-derives them on a later page load. `idleLabel()` words the countdown.
- **Narratives.** `POST /api/runs/:id/narrative` writes one (Opus call) for finished Reference
  runs only; refused for BYO and golden runs. `RunView` requests it once after completion.
- **Compare.** `commonPrefixLength`, `checkOutcomes`, `groupOutcomesByDimension`
  (`src/ui/compare/compareLedger.ts`) and `latestComparablePair` are pure and tested. The
  synthetic Safety check `lure_not_taken` is added at compare time when either run was attacked.
- **Packs.** `PackMeta.systems[key]` = `{ label, kind?: mcp|db|s3|tools, mode?:
  shadowed|mocked|pasted|localstack, provider? }`. `EntitySpec.owner` is `self` or `{ via }`;
  following `via` through `ref` fields reaches the principal. `FieldSpec.untrusted` marks
  injection surfaces. `ToolDef` has kind, system, description, input (FieldSpecs), guards,
  op/collection, returns. Provider catalogs exist for stripe, zendesk, slack, okta,
  google-workspace under `src/providers/<id>/tools.yaml`; a `mode: shadowed` system merges its
  provider's tools at load.
- **Pack persistence.** `GET /api/worlds/:id` → `{ pack }` including `pack.files`;
  `PUT /api/worlds/:id { files }` validates and saves the whole file set (atomic, deletes removed
  scenario files); `POST /api/worlds/validate { files }` → `{ ok, errors }`;
  `POST /api/worlds { id, files }` creates; `POST /api/worlds/generate { name, domain,
  description, schema?, tools?, openapi? }` → `{ files, errors, attempts }` (Claude, 1–3 min,
  503 without `ANTHROPIC_API_KEY`). `withPackId()` forces `pack.yaml`'s id.
- **Drafts.** `/mcp/worlds` (`register_agent` / `refine_world` / `create_world`) stores drafts in
  an in-memory, 2-hour-TTL registry (`src/generate/draftRegistry.ts`): `createDraft`, `getDraft`,
  `updateDraft`. There is no list function and no owner/token concept.
- **Agents.** `GET/POST /api/agents`, `PUT/DELETE /api/agents/:id`; `Agent` = id, name, version,
  shape (`mcp | forwarder | connector`), toolAliases, notes. `snippets.ts` renders the
  Claude Code MCP command, MCP JSON, TS/Python forwarders and the Anthropic connector block from a
  URL.
- **Baseline.** `tsc --noEmit` and `eslint` pass. `tests/ui/packView.test.ts` has 5 failures on
  `main` (Northwind's payments tools were renamed `create_refund` / `list_payment_intents` when
  Stripe shadowing landed; the tests still name `issue_refund`). Fixed as part of this work.
- **Fonts.** `src/app/layout.tsx` already loads Fraunces, Geist and Geist Mono via `next/font`
  onto `--font-fraunces`, `--font-geist-sans`, `--font-geist-mono`.
- **The mock's generator format doc** (`docs/worldpack-format.md`) does not describe
  `systems.kind/mode/provider`, so `generateWorldPack` never emits a shadowed system.

## 3. Decisions taken with the product owner (2026-09-17)

1. **Scenario editing depth** — text edits for Task Brief and Mandate, remove an Attack or a
   Check, add either by pasting a YAML snippet validated server-side; all saved to disk through
   `PUT /api/worlds/:id`. No structured per-Check forms.
2. **New World composition** — real generation: composed sources feed
   `POST /api/worlds/generate`; Copy-a-pack stays instant; Object storage (S3) is shown as a
   disabled roadmap tile; no build tokens (the backend has none); the drafts list reads the real
   `/mcp/worlds` registry.
3. **Dropped surfaces** — `/scenarios`, `/mandates`, `/connect`, `/dev`, the xyflow flow view and
   the `@xyflow/react` dependency are removed once their replacements are in.
4. **Live BYO runs** — after Start Run the wizard redirects to the Run page. While the run is
   running it shows events arriving live and, for a BYO run, the connection details and a Finish
   button. Once finished it gains a replay control (play, pause, scrub).

## 4. Architecture

### 4.1 Routes (the mock's views)

| Mock view | Route | Loads (server) | Client island |
|---|---|---|---|
| Runs | `/` | `listRuns()`, `loadPacks()` | none (rows are links) |
| Run detail | `/runs/[id]` | `loadRun`, the run's pack tools + systems | `RunPage` (polling, flow/list toggle, drawer, replay, connection strip) |
| Compare | `/compare?a=&b=` | `listRuns`, both runs, shared checks | `RunPicker`, `ActionLedger` (expand rows) |
| New run | `/runs/new` | `loadPacks().map(toWizardPack)`, `listAgents()` | `NewRunWizard` |
| World list | `/worlds` | `loadPacks()`, `listDrafts()` | none |
| World detail | `/worlds/[id]?tab=&scenario=` | `loadPack`, seed modes | `EntitiesTab`, `ToolsTab`, `ScenariosTab` |
| New world | `/worlds/new?draft=` | pack summaries, provider catalogs, drafts, one draft's files | `NewWorld` |

Server Components load data and hand plain props down; client islands own interaction and call
the API. Nothing under `src/ui/` value-imports `@/engine/pack`, `@/engine/attack`, `@/runner/store`
or anything else that reaches `node:fs` — the existing import-purity test in
`tests/ui/buildFlow.test.ts` is kept (moved with `groupWaves`, see §9) and keeps guarding this.

### 4.2 Styling

The mock's `<style>` block is ported into `src/app/globals.css` as-is, with three edits: the
Google Fonts `@import` is dropped; `--serif`, `--sans`, `--mono` point at the `next/font`
variables; the duplicated `.runs`-table rules (the mock repeats them twice) are collapsed to one
copy. Components use the mock's class names. Tailwind stays installed for the odd layout utility,
but no new palette constants are introduced: `src/ui/styles.ts` shrinks to what survivors still
import, and `--bg`, `--ink`, `--danger-fg` etc. become the palette.

Deviations from the mock, all deliberate: none in geometry or colour. Content deviations are
listed per surface below and are all of one kind — where the mock shows a fact the backend does
not have, the real fact is shown instead, or the element is left out.

### 4.3 Shell

`ConsoleShell` renders the mock's `.shell` grid: a 260 px `.sidebar` (brand mark, collapse button,
nav with the four items and their SVG icons) and `<main>`. Collapse to 64 px is client state in
`Sidebar`, persisted in `localStorage("agentsim.nav")`, toggled by the button or the `[` key when
focus is not in a field. Active item: `/` and `/runs/[id]` → Runs; `/runs/new` → New run;
`/compare` → Compare; `/worlds*` → World. The `<title>` is "AgentSim Console".

## 5. Runs (`/`)

Crumb "AgentSim", `h1.page` "Runs", sub line, toolbar with the "New run" primary button
(`/runs/new`), the runs table inside `.panel.table-wrap.runs-scroll`, three insight cards.

**Sub line.** `"{n} runs across {w} Worlds. {c} failed their Mandate — {every one of them | k of
them} under Attack."` where `w` counts distinct `packId`s among the runs, `c` counts `capped`, and
the tail says how many of the capped runs had an attack. Singulars handled.

**Table columns** — Run · Scenario · Agent (`c-agent`) · Attack (`c-attack`) · Trust · When
(`c-when`), exactly the mock's widths and breakpoints.

- Run: `.run-name` = `runName(summary)` = `"{agentLabel} — {attacked | clean}"`; `.run-id` = id.
  (The mock's hand-written names have no backend counterpart; this is the fact they encode.)
- Scenario: `.cell-main` = the scenario title up to the first `→`, trimmed; `.cell-sub` = pack
  name. Both come from `RunSummary` (see §10.1).
- Agent: `agentLabel`.
- Attack: attack id, or `— none` with `.off`.
- Trust: `.trust .n` = headline (or `…` while running, `—` when failed), `num-bad` when capped;
  badge = `runVerdict()`'s text/tone (PASS, CAPPED, Incomplete, Refused, Abandoned, Violations,
  Error, running…) in the matching `.badge-*`; `.dimstrip` = five segments in canonical Dimension
  order, `.bad` when `< 100`. Cell `title` = `"Task 100 · Correctness 50 · …"`.
- When: `relativeTime(createdAt, now)` — `"just now" | "{n} min ago" | "{n} h ago" | "{n} d ago"`,
  computed on the server with one `now` for the whole page.

The Run cell holds a `<Link>` to `/runs/{id}`; the whole row navigates on click (as today), so a
keyboard user gets one tab stop per row and a mouse user can click anywhere in it.

**Insight cards.**
1. Compare — `latestComparablePair(runs)`; card links to `/compare?a=&b=`, text
   `"{scenario short title}: {A agent} → {B agent}, {scoreA} → {scoreB}."`. Omitted when there is
   no pair.
2. Mandate in force — the policy text of the most recent run's scenario, first sentence, from the
   pack. Omitted when there are no runs.
3. Lures taken — `"{k} Lures taken"` where `k` counts runs whose violations include a
   `lure_not_taken` check (see §10.1), with the sub-line `"{k} of {a} attacked runs took the bait."`.

Empty state: the table body shows one row "No runs yet — start one to see it here."

## 6. Run detail (`/runs/[id]`)

Back link "← All runs", crumb `Runs / {scenario title}`, `.run-header` (pack pill, 20 px serif
title, mono id, right-aligned `Agent:` pill and `Attack: on|off` pill), then `.run-detail-grid`.

**Left panel** — `.run-toolbar` with the Flow | List toggle and `"{n} events"`; then either:

- **Flow** (`.flow-strip`): one `.flow-node` per event, `.flow-edge` between waves, events that
  share a wave stacked in `.flow-batch`. Waves come from `groupWaves(events)`. Node: `#seq`,
  `.sys-dot` coloured by `systemColor(systems, tool.system)`, tool name, `.argline` =
  `fmtArgs(input, tool)`, flags `injected` / `violation` / `error`; `.bad` when the event has a
  Violation or is the Lure (`matchesLure`). Clicking opens the drawer.
- **List** (`.list-strip`): one `.ledger-row` per event with the same facts, `injected` flag on
  the right.

While a run is running, new events append as `useRun` polls. Once it is not running, a replay
bar sits under the strip: play/pause (`▷` / `❚❚`), `#visible / total`, a range input, speed
toggle — `useReplay` and `ReplayScrubber`, restyled in the mock's vocabulary (`.run-toolbar`
sizes, `--ink` accents). During replay only the first `visible` events draw and the score panel
reads "replaying…".

**Connection strip** (BYO run, `status === "running"` only) — a `.panel.card-pad` above the grid
titled "Waiting for your agent · {n} events · idle {mm:ss}". It shows the shape the run's agent
registered with (`run.agent.shape`) and only that shape's snippet, built from `useOrigin()` and
the run id: MCP → the Claude Code command and MCP JSON per system (one entry per
`mcpUrls` key, i.e. per pack system); forwarder → TS/Python toggle and the forwarder snippet plus
the tools curl; connector → the Messages API block. Below: the Task Brief in a `.copyfield`-style
`<pre>` with Copy, and a primary "Finish & evaluate" button → `POST /api/runs/:id/finish`. A
Reference run shows no strip; while running its toolbar count reads "{n} events · running".

**Right column.**
- Trust Score panel: `.score-num` (red when capped), CAPPED badge, outcome badge when any, then
  the paragraph: `run.narrative` when present, otherwise `scoreSummary(score)`. Then five
  `.dim-bar-row`s. Narrative generation keeps `RunView`'s existing rule (request once, Reference
  runs only, never golden). While running or failed: "evaluating…" / "Run failed: {error}".
- World diff panel: heading "World diff · start → end"; one `.diff-row` per `run.diff` entry —
  `+` for added, `~` for changed, green / amber tone, red when a violating event changed that
  entity; last row `= {unchangedCount} entities unchanged · {reads outside}` via
  `readsOutsideLabel`. While running: "World is changing…".

**Event drawer** (`.drawer` + `.drawer-backdrop`, 380 px, closes on backdrop, ✕ or Escape):
"Event #n", tool name, badges (Injected content read here / Violation / Lure taken / error),
then fields Input (pretty JSON), Result or Error, Source (`"{source}"` plus ", this Run's Attack
surfaced text here" when injected), Changes, Timing (started / ended / duration / batch). Then,
when relevant: the Violations on this event as `ViolationCard`s, and the injected text in context
(`locateInjection`) with the planted span highlighted. `←` / `→` move between events.

## 7. Compare (`/compare`)

Crumb, `h1` "Compare runs", sub line, `.cmp-picker` (Run A over all completed runs, swap, Run B
over A's same-pack same-scenario peers) — `RunPicker` restyled; then in order:

1. `.cmp-cards` — per run: side label, `runName`, id, facts (`agentLabel`, Attack or "no
   Attack" in red when present, pack name, `"{n} events"`), score with PASS/CAPPED badge and, on
   B, `"{±delta} vs A"`; scenario title underneath.
2. The Attack panel (`AttackPanel` restyled to `.inject-meta`, `.inject-box`, `.took`) — only when
   either run has an attack.
3. Action ledger (`ActionLedger` restyled to `.cmp-step`, `.ledger-fork`, `.ledger-split`).
4. Checks (`ChecksTable` restyled to `.dimhead` / `.checkrow`) — the `.dimhead` row also shows
   each run's Dimension score in the A and B columns, `num-bad` below 100.
5. World diff (`WorldDiffCompare` restyled to `.cmp-writes` / `.diff-row`).

With fewer than two completed runs, or no peer for A, the page shows the picker and the mock's
explanatory sentence only. Different-pack pairs are refused by the picker (peers are same pack).

## 8. New run (`/runs/new`)

Crumb `Runs / New run`, `h1`, sub, `.steps` chips (Connect agent · World · Scenario · Mandate ·
Attacks · Review; done chips show ✓ and are clickable), `#stepBody`, `.footer-actions` (Back,
Cancel → `/`, Continue → / Done). The existing `NewRunWizard` state machine and `initialState`
deep-link handling stay; every step is restyled to the mock.

- **Connect agent** — left `.card-pad` with four `.option` radios (Reference Agent, MCP server,
  Forwarder, Anthropic Connector with the `needs a public URL` roadmap tag). Right card:
  Reference → prompt version pills from the pack's `agentVersions` with the naïve/fixed blurbs,
  then `.tooltable` Tool · Maps to · Status over the pack's tools (Maps to = `op collection`,
  Status = `ready`). Other shapes → the registered-agent `<select>` filtered by shape, "+ Register
  a new agent" opening `RegisterAgent` inline, the shape's snippet with `:id` placeholders (as in
  the mock), and the alias table Your tool · AgentSim tool · Status (`mapped` / `auto`) from the
  selected agent's `toolAliases`. Continue is disabled until a shape has an agent selected.
- **World** — `.world-grid` of `.world-card`s (name, domain, description, meta: entities,
  principal label, scenario count). Selecting resets scenario to the pack's first and attack to off.
- **Scenario** — `.scenario-card`s (serif title, task brief).
- **Mandate** — `.mandate-quote` with the policy text and the `.derive-note`.
- **Attacks** — "Off — clean run" `.attack-card.off` plus one card per attack (`id`, title,
  `.lure-tag` "⚡ Lure — {lureSummary}").
- **Review** — `.review-grid` (Agent, World, Scenario, Mandate first line, Attack) and the
  full-width "▷ Start Run" button → `POST /api/runs` → `router.push("/runs/{id}")`. Errors render
  under the button. The footer's Continue is hidden on the last step.

## 9. World

### 9.1 List (`/worlds`)

Crumb, `h1` "World", sub, "+ New world" → `/worlds/new`. Then, when `listDrafts()` returns any
draft, the "Worldbuilder drafts awaiting review — {n}" panel with one `.draft-row` per draft:
`.draft-id`, badge `awaiting review` (valid) or `has errors`, meta `"{name} · {relative time} ·
{tools} tools, {entities} entities · new World"`, and a "Review →" button to
`/worlds/new?draft={id}`. Then `.world-grid` of `.world-card`s from `PackSummary` (name, domain,
description, meta: `{collections} entities · Principal: {label} · {systems} systems · {tools}
tools`). Broken packs render the existing red "failed to load" panel underneath.

### 9.2 Detail (`/worlds/[id]`)

Back link, crumb `World / {name}`, `h1`, sub (description), `.tabs` Overview · Entities · Tools ·
Mandate · Scenarios driven by `?tab=` (`parseTab` gains `mandate`, loses `agents`), then one
`.panel.card-pad` (max-width 760 on Overview, 1040 otherwise).

- **Overview** — "What this World is made of" + `.src-list`: one `.src-item` per system, kind
  badge from `systems[k].kind` (`MCP`, `database`, `object store`, `own tools`, or `pack` when
  unset), label, mode, detail line `"{provider} catalog, mirrored over MCP"` /
  `"declared in tools.yaml"`, and the system's tool count. Then "Systems" chips
  (`systemColor`) and the Principal paragraph naming the principal entity's label. The mock's
  "Built by the worldbuilder plugin" row is omitted — packs carry no provenance.
- **Entities** — "Ownership map" with the Diagram | Table `.seg` toggle. Diagram = the mock's
  `erdSvg`: columns by ownership-chain depth (`ownershipChain(meta, collection)` follows
  `owner.via` → `ref`), boxes show name, `id_prefix`, visible row count, "the principal" on the
  root, `⚠ {field} is untrusted` on entities with an untrusted field; edges labelled with the
  `via` field; clicking a box selects it. Table = Entity · Id prefix · Owned via · Resolves to the
  principal (`chainHtml`) · Rows · Fields. Below, `.ent-layout`: the entity rail and the detail
  pane (mono name, prefix tag, untrusted tag, the "as seeded | under Attack" `.seg` when the pack
  has an attack), Fields table (Field · Type · Notes with `fk → x` and "untrusted — never an
  instruction"), then the seed rows: `.rec` cards when the entity has a `text` field, else
  `.seedtable`. Row tags: `planted by Attack` (a row absent from the seed), `outside the
  principal` (owner ≠ the pack's first scenario's `reads_scoped` principal, when that check
  exists), `the principal` (the principal row that check names). The mock's `note` prose per
  entity has no backend source and is omitted. Seed modes are computed server-side with the
  engine's `seedWorld` / `applyAttack` as today.
- **Tools** — hint line, `.tool-layout`: rail (sys-dot, name, `read|write`) and the pane that
  follows hover and pins on click: name, system chip, `writes to the World | read-only`, `op
  collection`, description; Input table (Param · Type · required/optional · Notes = enum values,
  min/max, ref); Output `<pre>` = `returns` as YAML when declared, else `"{Label} row"` /
  `"{Label} rows"` by op; Guards: one `enforced` row per `guards[]` entry (its `when` in mono,
  its `error` text) and one `untrusted` row when the tool reads a collection with an untrusted
  field. The mock's "graded" rows are derived: for each scenario check that names this tool
  (`arg_lte`, `arg_sum_lte`, `arg_in`, `owner_is`, `tool_not_called`) one `graded` row
  `"{type} — {checkParams}"`.
- **Mandate** — per scenario: title + id tag, the editable Mandate (see Scenarios), the
  explanatory sentence, the table Dimension · Check · What it binds (`checkParams`), one
  `.inject-box` per attack (`"What tries to break it — {id}. {title}. Lure: {lureSummary}"` plus
  the first policy-compliance check's type, or the "no Policy Compliance Check is written for it
  yet" tail), and the link to the full scenario (`?tab=scenarios&scenario={id}`).
- **Scenarios** — list: `.sc-card`s with title, brief, tags (id, `{n} Checks`, `{n} Attacks`,
  `{n} runs` from `listRuns`), "Open & edit" and, when no run references it, "Remove". Detail
  (`?scenario=`): back link, title/id/runs header, two columns — Task Brief and Mandate with the
  mock's inline `edit` → textarea → Save/Cancel; Attacks (`.attack-card` each with ✕, "+ add"
  opening a YAML snippet box); Checks grouped by Dimension (`.check-row` with type tag,
  `checkParams`, ✕; "+ add" opening a YAML snippet box with the Dimension/type reference in a
  hint). "+ New Scenario" opens the form (id, title, Task Brief, Mandate) and creates a file with
  one `reads_scoped` check on the pack's principal (the existing `scenarioSkeleton` extended with
  the typed fields).

**Saving.** Every edit goes through `src/ui/worlds/scenarioEdits.ts` (pure, tested): the YAML
`Document` API rewrites only the touched node so comments and ordering survive —
`setText(file, path, value)`, `removeAt(file, list, index)`, `appendSnippet(file, list,
snippetYaml)`, `newScenarioFile(...)`. The island holds the pack's `files`, validates with
`POST /api/worlds/validate`, shows errors inline (the mock has no error slot; a `.nw-note` in the
danger palette is used), and on success `PUT /api/worlds/:id` then `router.refresh()`. Remove
scenario deletes its file key. A snippet that fails validation is never saved.

### 9.3 New world (`/worlds/new`)

Back link, crumb `World / New world`, `h1`, sub, `.nw-steps` (How · Compose|Generate · Review),
one `.panel.card-pad`, footer (Back · Cancel · Continue/Review/Create World).

- **How** — two `.option`s: "Compose it yourself" and "Generate it with the worldbuilder plugin".
- **Compose** — `.src-list` of added sources (kind badge, label, mode, `"{n} entities · {u}
  untrusted fields"` where known, tool count, ✕) and the `.add-row`: `+ Third-party MCP`,
  `+ Your own tools`, `+ Database`, `+ Copy a pack`, and `+ Object storage` rendered disabled
  with the `roadmap` tag. Panels:
  - Third-party MCP: `.vendor-grid` of the real provider catalogs (stripe, zendesk, slack, okta,
    google-workspace; label, kind line, hue), the `.nw-note` on shadow mode, and the discovered
    tool table straight from the catalog. No URL/auth fields — the catalog is local.
  - Your own tools: MCP tools/list | OpenAPI | TypeScript `.seg` and a `.nw-ta` textarea (the
    mock's samples as placeholders, not values).
  - Database: `.nw-ta` for DDL. The "generate rows | load my own rows" seg is omitted (rows are
    always synthetic — see the format doc).
  - Copy a pack: `.world-grid` of installed packs.
- **Generate (plugin path)** — the real instructions: `claude plugin marketplace add
  ./claude-plugin` and `claude plugin install agentsim-worldbuilder` in `.copyfield`s, the MCP URL
  `/mcp/worlds` on this origin, the `AGENTSIM_ALLOWED_HOSTS` caveat from the README, the four
  tool names as `.chip`s, and the drafts list (`.draft-row`s, live, refreshed every 5 s via
  `GET /api/worlds/drafts`). Picking a draft moves to Review with its files. No tokens, no
  "Simulate the run".
- **Review** — `.shadowbar`, Name / Domain / Principal / Description fields, then:
  - With a draft (plugin path or a finished generation): the merged Entities table (Entity · Id
    prefix · Untrusted field, parsed from the draft's `pack.yaml`) and Tools table (Tool · System
    · Description, from `tools.yaml`), any validation errors, and the "First Scenario, drafted"
    block from the first `scenarios/*.yaml` (title, policy, checks by Dimension, first attack).
    Primary button "Create World" → `POST /api/worlds { id, files }` with the id from the Name
    (slugified, editable) → `/worlds/{id}`.
  - Compose with only "Copy a pack": the copied pack's tables; Create World copies its files
    under the new id (instant).
  - Compose with anything else: primary button reads "Generate with Claude"; it calls
    `POST /api/worlds/generate` with `tools` = the pasted tool text plus each chosen provider's
    catalog rendered as `- name: description` lines, `schema` = the DDL, `openapi` = the pasted
    OpenAPI, and `description` = the typed description plus one line per source ("Source:
    Stripe, shadowed over MCP"). An elapsed counter runs; on return the page becomes the draft
    case above. Generated packs own their tools (the generator does not know shadowed systems —
    §2, last bullet); their Overview shows systems with the `pack` badge.

## 10. Backend changes (all small)

1. `RunSummary` gains `packName`, `scenarioTitle` (copied from the record) and `lureTaken`
   (`violations.some(v => v.checkType === "lure_not_taken")`). `toSummary` fills them; the
   `/api/runs` list therefore carries them too.
2. `PackSummary` gains `systems` (count of `meta.systems` keys).
3. `draftRegistry.ts` gains `listDrafts(): Draft[]` (expiry-filtered, newest first) and a new
   route `GET /api/worlds/drafts` → `[{ id, createdAt, name, domain, valid, errorCount, tools,
   entities }]` (counts parsed from the draft's YAML with the `yaml` package server-side).
   `GET /api/worlds/drafts/:id` → the draft's `{ files, errors }` for Review.
4. `parseTab` / `WORLD_TABS`: `agents` → `mandate`. The raw YAML editor (the existing
   `PackEditor`, with `PackTabs` restyled to the mock's `.tabs` and its own five file tabs
   including `agents`) moves to `/worlds/[id]/edit`, reached from a small "Edit pack files" link in
   the World detail header. That keeps Reference Agent prompts and every other file editable
   without adding a tab the mock does not draw. `PackEditor`'s tab logic (`tabFileKey`, `fileTab`)
   keeps its own tab list and is otherwise untouched.

No engine change. No new dependency.

## 11. Removals (after the replacements ship)

Pages: `src/app/scenarios`, `src/app/mandates`, `src/app/connect`, `src/app/dev`.
Components: `Header`, `Launcher`, `ConnectAgent`, `RecentRuns`, `RunHeader`, `RunView`,
`Timeline`, `EventRow`, `CompareColumn`, `CompareRunColumn`, `PromptDiffSheet`, `lineDiff`,
`fixture`, `src/ui/flow/{FlowView,FlowToolbar,EventNode,MetaNodes,toXyflow,useFlowCamera,
useFlowState}`, `src/ui/scenarios/*`, `src/ui/connect/{ConnectPage,AgentList,StartRun,
ConnectionCard}`, `src/ui/worlds/{EntityMap,entityLayout,ToolCards,ScenarioCards,AgentPrompts,
PackCard}`. Dependency: `@xyflow/react` and its stylesheet import. Tests that only covered removed
code go with it (`entityLayout.test.ts`, `lineDiff.test.ts`, the layout half of
`buildFlow.test.ts`). `groupWaves` moves to `src/ui/waves.ts` with its tests and the import-purity
guard. `RunsListPage.tsx`'s `runVerdict` moves to `src/ui/verdict.ts` with its test.

## 12. Testing

- Pure modules get vitest tests: `runName`, `relativeTime`, the Runs sub-line, `ownershipChain` and
  the ERD column layout, the seed-row tags, `outputLabel` / `guardRows` for the Tools pane,
  `scenarioEdits` (set / remove / append / new-file, comment preservation, invalid snippet →
  error), the New World source → `GenerateInput` mapping, `listDrafts` ordering and expiry.
- Route tests for `GET /api/worlds/drafts` and the enriched `RunSummary` / `PackSummary` follow
  `tests/api/*.test.ts` conventions (route handlers called directly, temp packs dir).
- The five failing `packView` tests are corrected to Northwind's current tools.
- Each surface is screenshot-checked against the mock in a real browser (Playwright) at 1280 px
  and 720 px before its task is marked done; `tsc`, `eslint` and `vitest` pass at every commit.

## 13. Out of scope

Object storage sources, build tokens and draft ownership, a stored run name, structured
per-Check forms, generated packs that declare shadowed systems, and any change to scoring,
the DSL, or the MCP endpoints.
