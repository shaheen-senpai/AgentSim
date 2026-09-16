# AgentSim UI Redesign — Warm Monochrome Premium

## Context

AgentSim's UI works but is visually flat: one grey-white background (`#f4f4f2`), one ink color
(`#1d1d1b`), one sans face (Geist) at three barely-different sizes (11/12/13px), flat borders, no
type hierarchy, no dark mode. The user wants a full visual rethink — "seamless, premium, like an
Apple website" — inspired by a reference site a friend built (a data-dense "AgentSim console": cream
background, near-black monochrome accent, serif display headlines paired with a monospace data
table, soft pastel status pills, card-based insight surfaces, icon-forward sidebar nav with a black
active pill), explicitly: take inspiration, don't copy exactly.

This is a **visual and typographic redesign of the existing, fully-working app** — no functional or
interaction changes. Scope, agreed with the user before this spec was written:

- **Flagship-first rollout.** Design and ship the new system on one flagship template first —
  `RunView` + `Header`, which together already serve both the empty/home state (`/`, no Run) and the
  active-Run state (`/runs/:id`) — get it running and reviewed, *then* extend the same tokens and
  component patterns to Worlds/Connect/Compare/New World in a follow-up pass. This spec covers only
  the flagship template in full detail; it defines the token system every later page reuses.
- **Light-only for now.** Dark mode is an explicit fast-follow, not part of this spec. Every token
  below is a flat value, not yet a light/dark pair.
- **Restyle in place, not restructure.** The Flow canvas (`react-flow`), the YAML editors, and the
  entity-relationship map keep their exact current layout, behavior and interaction model. Only their
  colors move to the new palette, through the same two integration points that already exist for this
  (`globals.css`'s `.react-flow__*` overrides, `systemColor.ts`'s hue table) — no new integration
  surface, no react-flow API changes.

## Reference & inspiration

Looked at (screenshots in `/private/tmp/.../scratchpad/ui-inspiration/`, not committed — a live
third-party site, not something to check into this repo): the reference's own "Runs" list (sidebar
nav with a black active-item pill, serif headline over a small-caps breadcrumb, a monospace data
table with soft pastel PASS/FAIL badges, three card-based "insight" surfaces below it) and its
marketing page (bold serif narrative headlines against cream, dark "console" mockups as proof
imagery, red danger callouts, monospace code blocks).

Taking: the warm cream + monochrome-ink base, the serif-headline / mono-data type pairing, soft
pastel (not neon) status color, pill-shaped primary actions, card-based surfaces with a small
circular icon for "this is worth noticing" content.

Not taking: their specific sidebar-navigation layout (AgentSim's nav is a thin top header across a
three-column working layout, not a left rail — changing that is a restructure, out of scope here),
their exact color values (adapted, not copied), their copy/content.

Deliberately blending two references rather than picking one: "Apple-like premium" (restraint,
generous whitespace, confident hierarchy, quality of motion and material — Apple itself never uses a
serif in UI) with the reference site's specific personality choice (a serif/mono pairing). The serif
is used narrowly enough — headlines only, never body, buttons, or data — that the two read as one
coherent system rather than two aesthetics fighting each other.

## Design tokens

All values below are exact and are what gets written into `src/ui/styles.ts` — the single file every
current component already imports its class-name constants from (`panel`, `heading`, `mono`,
`focusRing`, `primaryButton`, `secondaryButton`, `field`, `label`, `hint`, `RED`). This spec extends
that file's vocabulary; it does not introduce a second styling system alongside it.

### Color

| Token | Old value | New value | Role |
|---|---|---|---|
| `bg` | `#f4f4f2` (body, `globals.css`) | `#F7F5EF` | Page background — warm cream, not grey |
| `surface` | `#ffffff` (ad hoc `bg-white`) | `#FFFFFF` | Card/panel fill — unchanged value, but now contrasts against a warmer `bg`, so it reads as elevated instead of blending in |
| `ink` | `#1d1d1b` | `#1B1A17` | Primary text, primary button fill, focus ring |
| `muted` | `#6b6b66` | `#6E6B60` | Secondary text, meta labels |
| `border` | `#cfcfcb` | `#E3E0D5` | Hairline borders |
| `danger` | `RED = #c8321e` (flat) | fg `#B23A22` / bg `#FBEAE7` | Violations, FAIL, destructive actions — now a soft pastel pill, not a flat red flash |
| `success` | *(none — ad hoc greens in ScorePanel/ViolationCard today)* | fg `#1E7A43` / bg `#E7F4EA` | PASS, no-Violation states — newly formalized |
| `warning` | *(none)* | fg `#8A5A12` / bg `#FDF3DF` | Partial/borderline states (a Dimension score that's neither clean nor capped) |

`systemColor.ts`'s 8-hue rotation (`PALETTE` + its `tint()` mixer) is kept exactly as-is
mechanically — only the 8 hex values themselves are warmed slightly so they sit comfortably on the
new cream `bg` instead of the old grey one. The function signature, the tint math, and every call
site are unchanged.

### Type

Three roles, only one new font:

- **Display serif — headlines only.** New: **Fraunces** (variable, via `next/font/google`, `subsets:
  ["latin"]`, a soft/light optical setting — not the wonky/expressive axis, which would read as
  playful rather than premium). Used in exactly two places on the flagship template: the empty-state
  headline ("Pick a Scenario and press Run") and the Scenario title when a Run is active. Never body
  text, never inside a button, never in a data table or the Flow canvas.
- **UI sans — everything else.** Unchanged: **Geist Sans** (already loaded in `layout.tsx`). Nav,
  labels, buttons, form controls, body copy, panel headings.
- **Mono — data and ids.** Unchanged: **Geist Mono** (already the `mono` token). Run ids, tool names,
  code, YAML.

Type scale (new — today the app has only 11/12/13px, everywhere, with no hierarchy):

| Role | Size | Weight | Face |
|---|---|---|---|
| Micro (meta labels, the existing `heading` token) | 11px | 600, uppercase, `.08em` tracking | Sans |
| Small (badges, hints) | 12px | 400–600 | Sans |
| Body | 15px | 400 | Sans |
| Section headline | 20px | 500 | Serif |
| Page/empty-state headline | 28–40px (responsive) | 500 | Serif |

### Spacing & components

- **Chrome gets more room; data stays dense.** Header height, Launcher padding, and button targets
  loosen (roughly +30-40% padding/gap over current `p-4`/`gap-4`/`h-8`-`h-9` values). The Flow canvas,
  Score/Diff panels, and any data table keep their current density — this is a working tool, and the
  goal is hierarchy, not empty space where information used to be.
- **Buttons become full pills.** `primaryButton`/`secondaryButton` move from `rounded` (current: a
  small corner radius) to `rounded-full`, matching the reference's black pill "New run" button.
  Height increases slightly (`h-8`/`h-9` → `h-10`) for a more confident click target.
- **Cards get soft elevation in addition to their border, not instead of it.** `panel` keeps a
  1px hairline border (now the new, lighter `border` token) and adds a soft, barely-there shadow —
  `shadow-[0_1px_2px_rgba(27,26,23,0.06),0_4px_12px_rgba(27,26,23,0.04)]` — plus a slightly larger
  radius. Belt-and-suspenders on purpose: the shadow alone doesn't read reliably against the new
  cream background when two cards sit flush with no gap between them, so the hairline stays as the
  crisp edge and the shadow adds the sense of material on top of it.
- **Status pills are a new, real component**, not ad hoc per-file color literals: a small
  `StatusPill` (or equivalent shared class) using the `success`/`danger`/`warning` tokens above,
  fully rounded, used for PASS/FAIL, Violation severity, and Dimension state anywhere they currently
  render as plain colored text.

## Flagship application: `Header` + `RunView`

**Header** (`src/ui/Header.tsx`): height increases slightly; the "AgentSim" wordmark keeps Geist
Sans (extra-bold, tracked tight — a serif wordmark at this small a size would look mismatched with
its own nav row) but sits with more breathing room; nav items move from a plain color-change
active-state to a subtle underline or soft pill on hover, matching the calmer, more considered
interaction language of the reference; the pack/agent/attack context badges (currently
`border-[#cfcfcb] rounded-full px-2 py-0.5`) keep their current shape (already pills) and move to the
new border/muted tokens.

**`RunView`, no active Run** (today: `<div className="p-6 text-[#6b6b66]">Pick a Scenario and press
Run.</div>`): becomes a real empty state — the serif page headline at the 28–40px size, the same
sentence, sitting in the main panel with generous surrounding space; the Launcher rail to its left is
otherwise functionally identical (same selects, same segmented controls), restyled with the new
tokens (pill buttons, new border/ink colors).

**`RunView`, active Run**: the three-column layout (`Launcher` | Flow/Timeline | `ScorePanel` +
`DiffPanel`) is unchanged structurally. Every panel restyles via the shared `panel`/`heading`/button
tokens (so this is largely automatic once `src/ui/styles.ts` changes) — the Flow canvas's own colors
(node fills, edge strokes, the two `.react-flow__*` overrides in `globals.css`) move to the new
palette; PASS/FAIL and Violation severity in `ScorePanel`/`DiffPanel`/`ViolationCard` move to the new
`StatusPill` component.

## Rollout after this spec

Not part of this pass, explicitly deferred: Worlds list/detail (5 tabs), Connect page, Compare page,
New World — these reuse the same tokens and `StatusPill` once the flagship pass lands and is
reviewed; each is a mechanical re-skin against an already-proven system, not a new design decision.
Also deferred: dark-mode token pairs; any layout change to the Flow canvas, YAML editors, or entity
map beyond their colors.

## Out of scope

- Any new interaction, page, or data model — this spec is colors, type, spacing and a handful of
  shared component classes.
- Dark mode (tokens above are single-value, not light/dark pairs).
- Restructuring the Flow canvas, YAML editors, or entity-relationship map layout.
- Any change to `systemColor.ts`'s mechanism, only its 8 hue values.
