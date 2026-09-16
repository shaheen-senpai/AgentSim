# AgentSim Console — Phase 2: New Run Wizard

## Context

Phase 1 (shipped, merged) gave the app a sidebar shell and moved the old single-page Launcher to
`/runs/new`, unchanged in content. This spec covers **Phase 2** of the 5-phase Console redesign
(`docs/superpowers/specs/2026-09-16-console-shell-design.md`): replacing `/runs/new`'s content with
the approved mockup's 6-step wizard — Connect agent → World → Scenario → Mandate → Attacks → Review
— reusing the app's real data and real agent-registration/Run-creation code, not new logic.

Design source: the approved "AgentSim Console" mockup (Claude Artifact `34c6783b-…`, v6), wizard
section (`view-wizard`, `STEPS`, `renderStepBody`). This spec reads real behavior off that mockup and
grounds every field in the current codebase — where the mockup shows placeholder/demo data, this
spec says exactly what real data replaces it.

## Confirmed facts (verified against the current codebase, not assumed)

- `/runs/new` (`src/app/runs/new/page.tsx`) currently renders `<RunPage id={null} .../>`, which
  renders `RunView` with `run: null` — an empty flow canvas plus the `Launcher` rail. **`RunView`
  also renders that same `Launcher` rail on real Run pages** (`/runs/:id`, for a "launch another Run
  from here" shortcut) — `src/ui/RunView.tsx:62`. Phase 2 touches **only** `/runs/new`'s content; it
  does not touch `RunView`, `RunPage`, `Launcher.tsx`, `ConnectAgent.tsx`, or `/runs/:id` at all —
  those keep serving the real Run detail page exactly as today, Launcher rail included. `useRun`'s
  loading state (a real id whose first fetch hasn't resolved) still needs `RunView`'s null-run
  branch, so that branch is not dead code even after this phase.
- Reference-Agent Run creation today (`src/ui/Launcher.tsx:57-72`): `POST /api/runs` with body
  `{ packId, scenarioId, agent: { kind: "reference", version }, attackId: attackId === "off" ? null : attackId }`,
  then `router.push(\`/runs/${id}\`)`.
- BYO-Agent Run creation today (`src/ui/connect/StartRun.tsx:53-83`): same route, body
  `{ packId, scenarioId, agent: { kind: "byo", agentId }, attackId, idleTimeoutMs }`; response carries
  `{ id, url, mcpUrl, callUrl, taskBrief }`. A BYO Run needs an already-registered `Agent` — there is
  no way to create one without an `agentId`.
- Agent registration: `POST /api/agents` (`src/app/api/agents/route.ts:11-15`), body validated by
  `AgentInputSchema` (`src/runner/agentRegistry.ts:31`), returns the saved `Agent`
  (`{ id, name, version, shape: "mcp"|"forwarder"|"connector", toolAliases, notes }`, plus fields on
  `Agent` not needed here). `RegisterAgent.tsx` is the existing form for this — name, version, shape
  toggle, tool-aliases textarea, notes, calling `onSubmit` with an `AgentSubmission`.
- `GET /api/agents` / `listAgents()` (`src/runner/agentRegistry.ts`) returns every registered `Agent`
  — the wizard's Connect step can offer "use an already-registered agent" instead of registering a
  new one every time.
- Snippet builders already exist as pure functions of a name + URL, no DOM/React import
  (`src/ui/connect/snippets.ts`): `mcpAddCommand`, `mcpJsonConfig` (Shape A), `forwarderTs`,
  `forwarderPy` (Shape B), `connectorBlock` (Shape C). Before a Run exists there is no real `mcpUrl`/
  `callUrl` yet — the wizard passes the literal placeholder path `/mcp/runs/:id` (matching the
  mockup's own placeholder copy, `http://localhost:3000/mcp/runs/:id`), documentation only; the real
  URL appears on `/runs/:id` once the Run exists (`ConnectAgent.tsx`, unchanged, already builds it).
- Pack/Scenario data available server-side (`src/engine/pack.ts`): `WorldPack.meta` has
  `{ id, name, domain, description, principal }`; `Object.keys(meta.entities).length` is the entity
  count; `Object.keys(tools).length` is the tool count; `new Set(Object.values(tools).map(t=>t.system)).size`
  is the distinct-Systems count (`ToolDef.system: string`, line 60). `Scenario` has
  `{ id, title, task_brief, policy: { text }, checks: Check[], attacks: Attack[] }`; `Attack` has
  `{ id, title, mutation, lure: { tool, args_match } }` (`pack.ts:97-104`). None of this is on today's
  `PackOption` (`src/lib/summaries.ts:26-31`, used by the old Launcher) — it only carries
  `{ id, name, scenarios: ScenarioSummary[], agentVersions }`, and `ScenarioSummary` only carries
  `{ id, packId, title, attacks: {id,title}[] }` — no domain/description/principal/counts, no
  `task_brief`/policy text, no `lure`. The wizard needs a richer summary (new types, §Design).
- `Dimension` type and the ordered `DIMENSIONS` array live in `src/engine/dimensions.ts`.
- Design tokens: reuse `src/ui/styles.ts` exactly as Phase 1 did (`panel`, `heading`, `mono`, `serif`,
  `field`, `label`, `hint`, `focusRing`, `primaryButton`, `secondaryButton`, `dangerPill`,
  `successBg`/`successFg`, `dangerBg`/`dangerFg`). `src/ui/connect/RegisterAgent.tsx` and
  `src/ui/connect/StartRun.tsx` already import from `src/ui/styles.ts` (confirmed by direct read —
  they are consistent with Phase 1's tokens, not a divergent palette).

## Design

### Route

`src/app/runs/new/page.tsx` (rewritten): a server component that reads `loadPacks().packs` mapped
through a new `toWizardPack()` summary (below) and `listAgents()`, and renders
`<ConsoleShell><NewRunWizard packs={...} agents={...} /></ConsoleShell>` — no `RunPage`/`RunView`
involved at all.

### New summary types — `src/lib/summaries.ts` (additive; existing exports untouched)

```ts
export type WizardAttack = { id: string; title: string; lure: { tool: string; argsMatch: Record<string, unknown> } };
export type WizardTool = { name: string; description: string };
export type WizardScenario = {
  id: string;
  packId: string;
  title: string;
  taskBrief: string;
  policyText: string;
  attacks: WizardAttack[];
  checkCountByDimension: { dimension: Dimension; count: number }[];
};
export type WizardPack = {
  id: string;
  name: string;
  domain: string;
  description: string;
  principal: string;
  entities: number;
  systems: number;
  tools: WizardTool[];
  agentVersions: string[];
  scenarios: WizardScenario[];
};

export function toWizardScenario(s: Scenario, packId: string): WizardScenario { /* ... */ }
export function toWizardPack(p: WorldPack): WizardPack { /* ... */ }
```

### `src/ui/wizard/` (new directory)

- **`NewRunWizard.tsx`** — owns all wizard state, the step strip, the current step's body, and the
  footer (Back / Cancel / Continue). `"use client"`.
- **`StepStrip.tsx`** — the 6 step-chips + connecting lines (mockup's `.steps`/`.step-chip`), current
  step highlighted solid ink, earlier steps shown done (✓, muted-green), later steps neutral. Clicking
  an earlier-or-current chip jumps to it; later chips are inert (unclickable, matches mockup's
  `s<=state.step` guard).
- **`steps/ConnectStep.tsx`** — left: 4 radio options (Reference Agent / MCP server / Forwarder /
  Anthropic Connector). Right: for Reference Agent, a naïve/fixed toggle + the pack's tool list
  (`WizardTool[]`, name + description, "ready" pill); for the other three, an "Existing agents of this
  shape" `<select>` (from `agents.filter(a => a.shape === mode)`, first entry defaulted) shown only
  when at least one exists, a "Register a new agent" toggle that renders `RegisterAgent` with its
  `shape` locked to the current mode (`RegisterAgent` gains an optional `lockedShape?: AgentShape`
  prop — when set, the shape fieldset is hidden and `shape` state is seeded from it instead of the
  hardcoded `"mcp"` default), the matching snippet (`mcpAddCommand`/`forwarderTs`(+language toggle,
  reusing the mockup's TS/Python choice)/`connectorBlock`) against the placeholder `/mcp/runs/:id` (or
  `/api/runs/:id/call` for the forwarder) URL, and a tool-alias table (`WizardTool[]` vs. the picked/
  registered agent's `toolAliases`, "mapped" pill when aliased else "auto").
- **`steps/WorldStep.tsx`** — a card grid over `packs`, one `WizardPack` per card: name, domain, 2-line
  description, meta row (`${entities} entities`, `Principal: ${principal}`, `${systems} systems`,
  `${tools.length} tools`). Selecting a pack resets `scenarioId` to that pack's first Scenario and
  `attackId` to `"off"` (mirrors old Launcher's `selectPack`). Empty state (`packs.length === 0`): a
  message + a link to `/worlds/new`, no cards.
- **`steps/ScenarioStep.tsx`** — a card list over the selected pack's `scenarios`: title (serif) +
  `taskBrief`.
- **`steps/MandateStep.tsx`** — the selected Scenario's `policyText` in a quoted block, plus a
  "↳ drawn from the Scenario you picked — “{title}”" note (mockup's `.derive-note`).
- **`steps/AttackStep.tsx`** — an "Off — clean run" card plus one card per Scenario `attacks` entry:
  `id`, `title`, and a lure line formatted as: if `Object.keys(lure.argsMatch).length === 1`, render
  `${lure.tool} → ${the one value}`; otherwise `${lure.tool} → ${entries.map(([k,v])=>`${k}: ${v}`).join(", ")}`.
- **`steps/ReviewStep.tsx`** — a definition list (Agent / World / Scenario / Mandate-first-line /
  Attack) plus the real, working **Start Run** button: builds the request body per §Confirmed-facts
  (reference vs. byo), `POST /api/runs`, `busy`/`error` state (same UX pattern as the old Launcher —
  inline error panel using `dangerPill`/`dangerBg`/`dangerFg`), on success `router.push(\`/runs/${id}\`)`.
  This is the *only* place a Run is actually created — the footer's Continue button never creates one.

### Footer (owned by `NewRunWizard.tsx`)

Back (hidden on step 0) · Cancel (→ `router.push("/")`) · Continue → (advances `step`; **hidden
entirely on step 5**, since Review renders its own Start Run button). Continue is disabled on step 0
when the chosen connect mode is not `"reference"` and no agent is yet picked/registered
(`existingAgentId === null`), and on step 1 when `packs.length === 0`.

### Data flow

`loadPacks().packs.map(toWizardPack)` + `listAgents()` → `NewRunWizard` (all client-side thereafter,
no new API routes) → Review's Start Run → existing `POST /api/runs` (unchanged) → `router.push`.

### Out of scope for Phase 2

`RunView`'s Launcher rail on `/runs/:id` (unchanged — still the old inline picker, a separate,
already-working feature); World/Scenario/Mandate detail pages (Phases 3-4); the Compare ledger-diff
view (Phase 5); any new World-creation flow (unchanged, `/worlds/new` already exists).

## Self-review

- **Placeholder scan**: none — every field is either sourced from a named, existing type/route, or a
  new type whose shape is fully spelled out above.
- **Consistency**: the routing/data-flow section and confirmed facts agree; `RegisterAgent`'s new
  `lockedShape` prop is the only change to an existing shared component, and it's additive/optional
  (existing `/connect` callers pass nothing, keep today's shape-toggle behavior).
- **Scope**: touches 1 route, adds 1 summary-builder + ~7 new small components, changes 1 existing
  prop-optional addition to `RegisterAgent`. No engine changes, no new API routes.
