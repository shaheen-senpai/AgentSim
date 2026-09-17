# Console Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the AgentSim console to match `design/agentsim-console.html` exactly, wired to the real backend, and remove the surfaces the design drops.

**Architecture:** Next.js App Router pages stay Server Components that load data from the engine/runner and hand plain props to small `"use client"` islands. The mock's CSS is ported verbatim into `globals.css` and components use its class names. Every fact on screen comes from `RunRecord`, `RunSummary`, `WorldPack` or a provider catalog; anything the backend lacks is left out.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind 4 (kept for utilities), `yaml` 2.9 (Document API for edits), vitest, Playwright MCP for visual checks.

**Spec:** `docs/superpowers/specs/2026-09-17-console-redesign-design.md`

## Global Constraints

- Nothing under `src/ui/` may value-import `@/engine/pack`, `@/engine/attack`, `@/runner/store`, `@/runner/agentRegistry` or a `node:` builtin (guarded by the import-purity test; type-only imports are fine).
- No non-comment line under `src/ui/` may contain `northwind`, `customer(s)`, `payment(s)` or `refund(s)` (domain-neutrality test).
- No fake data ships. A fact the backend does not have is omitted, never invented.
- No new npm dependency. `@xyflow/react` is removed in Task 14.
- `npx tsc --noEmit`, `npx eslint` and `npm test` pass at every commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Work happens on branch `sn/build/console-redesign`.
- Mock line references below are into `design/agentsim-console.html`; "port lines N–M" means reproduce that markup as JSX with the same class names.

---

### Task 1: Shell — CSS port, layout, sidebar

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `src/ui/ConsoleShell.tsx`
- Modify: `src/ui/Sidebar.tsx`
- Create: `src/ui/nav.ts`
- Test: `tests/ui/nav.test.ts`

**Interfaces:**
- Produces: `activeNav(pathname: string): "runs" | "compare" | "wizard" | "world" | null` in `src/ui/nav.ts`; `ConsoleShell({ children })` rendering `<div class="shell"><aside class="sidebar">…</aside><main>{children}</main></div>`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/ui/nav.test.ts
import { describe, expect, it } from "vitest";
import { activeNav } from "@/ui/nav";

describe("activeNav", () => {
  it("maps every route family onto its sidebar item", () => {
    expect(activeNav("/")).toBe("runs");
    expect(activeNav("/runs/run_abc")).toBe("runs");
    expect(activeNav("/runs/new")).toBe("wizard");
    expect(activeNav("/compare")).toBe("compare");
    expect(activeNav("/compare?a=x")).toBe("compare");
    expect(activeNav("/worlds")).toBe("world");
    expect(activeNav("/worlds/northwind/edit")).toBe("world");
    expect(activeNav("/nothing")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run tests/ui/nav.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement `src/ui/nav.ts`**

```ts
export type NavKey = "runs" | "compare" | "wizard" | "world";
export const NAV: { key: NavKey; href: string; label: string }[] = [
  { key: "runs", href: "/", label: "Runs" },
  { key: "compare", href: "/compare", label: "Compare" },
  { key: "wizard", href: "/runs/new", label: "New run" },
  { key: "world", href: "/worlds", label: "World" },
];
export function activeNav(pathname: string): NavKey | null {
  const p = pathname.split("?")[0];
  if (p === "/runs/new") return "wizard";
  if (p === "/" || p.startsWith("/runs")) return "runs";
  if (p.startsWith("/compare")) return "compare";
  if (p.startsWith("/worlds")) return "world";
  return null;
}
```

- [ ] **Step 4: Port the CSS.** Replace `src/app/globals.css` with: `@import "tailwindcss";` then the mock's `<style>` block (lines 3–494) with these edits: delete the `@import url('https://fonts.googleapis.com…')` line; set `--serif:var(--font-fraunces),Georgia,serif; --sans:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif; --mono:var(--font-geist-mono),ui-monospace,Menlo,monospace;`; delete the second copy of the `.cell-sub` … `@media (max-width:560px)` block (lines 152–177, a verbatim duplicate of 129–151 plus tighter breakpoints — keep the first block and the 720/560 breakpoints from the second); keep the `@import "@xyflow/react/dist/style.css"` line for now (Task 14 removes it). Also port the `body{background:#faf9f5…}` reset from line 1 into `body{}`.

- [ ] **Step 5: Layout and shell.** In `layout.tsx` set `metadata.title = "AgentSim Console"`, description "A flight simulator for AI agents." Keep the font variables. Body class: `min-h-full`. `ConsoleShell`:

```tsx
import { Sidebar } from "./Sidebar";
export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell" id="shell">
      <Sidebar />
      <main>{children}</main>
    </div>
  );
}
```

`Sidebar` (client): port lines 497–522. Brand block with the mark and `<b>AgentSim</b>`, the `.navcollapse` button, `<nav>` of `NAV` items as `<Link className={"navitem" + (active ? " active" : "")}>` with the four SVGs from lines 505/509/513/517 and `<span className="navlabel">`. Collapse: `useState(false)`, on mount read `localStorage.getItem("agentsim.nav") === "collapsed"`, toggle writes it back, add/remove `nav-collapsed` on `document.getElementById("shell")` (the mock's CSS keys off `.shell.nav-collapsed`), button text `«`/`»`, `aria-expanded`; `keydown` listener for `[` ignoring modifier keys and inputs/textarea/select/contentEditable (mock lines 2443–2448). Active item from `activeNav(usePathname())`.

- [ ] **Step 6: Run** `npx vitest run tests/ui/nav.test.ts && npx tsc --noEmit && npx eslint` → PASS. Start `npm run dev`, load `/`, confirm the sidebar renders in the new palette (the page body is still the old one).

- [ ] **Step 7: Commit** — `git add -A src/app/globals.css src/app/layout.tsx src/ui/ConsoleShell.tsx src/ui/Sidebar.tsx src/ui/nav.ts tests/ui/nav.test.ts && git commit -m "feat(console): port the mock's CSS, shell and collapsible sidebar"`.

---

### Task 2: Pure helpers — relative time, run name, verdict

**Files:**
- Create: `src/ui/relativeTime.ts`
- Modify: `src/ui/format.ts` (add `runName`, `scenarioShortTitle`, `firstSentence`)
- Create: `src/ui/verdict.ts` (move `runVerdict` out of `RunsListPage.tsx`, add `verdictBadgeClass`)
- Modify: `src/ui/RunsListPage.tsx` (import `runVerdict` from `./verdict`; delete its local copy)
- Test: `tests/ui/relativeTime.test.ts`, `tests/ui/format.test.ts`, `tests/ui/verdict.test.ts` (rename from `runsListPage.test.ts`, keep `latestComparablePair` tests importing from `@/ui/compare/latestComparablePair`)

**Interfaces:**
- Produces: `relativeTime(iso: string, now: number): string`; `runName(agentLabel: string, attackId: string | null): string`; `scenarioShortTitle(title: string): string`; `firstSentence(text: string): string`; `runVerdict(r: RunSummary): Verdict`; `verdictBadgeClass(tone: Verdict["tone"]): string`.

- [ ] **Step 1: Tests**

```ts
// tests/ui/relativeTime.test.ts
import { describe, expect, it } from "vitest";
import { relativeTime } from "@/ui/relativeTime";
const now = Date.UTC(2026, 8, 17, 12, 0, 0);
describe("relativeTime", () => {
  it("rounds down into the mock's four buckets", () => {
    expect(relativeTime("2026-09-17T11:59:40Z", now)).toBe("just now");
    expect(relativeTime("2026-09-17T11:45:00Z", now)).toBe("15 min ago");
    expect(relativeTime("2026-09-17T09:10:00Z", now)).toBe("2 h ago");
    expect(relativeTime("2026-09-14T12:00:00Z", now)).toBe("3 d ago");
  });
  it("treats a future or unparseable time as just now", () => {
    expect(relativeTime("2026-09-18T00:00:00Z", now)).toBe("just now");
    expect(relativeTime("garbage", now)).toBe("just now");
  });
});
```

Append to `tests/ui/format.test.ts`:

```ts
describe("runName / scenarioShortTitle / firstSentence", () => {
  it("names a run by its agent and whether it was attacked", () => {
    expect(runName("naïve", "billing-note-injection")).toBe("naïve — attacked");
    expect(runName("Halvard Loop Agent", null)).toBe("Halvard Loop Agent — clean");
  });
  it("keeps the part of a title before the arrow", () => {
    expect(scenarioShortTitle("Duplicate charge → refund the extra payment")).toBe("Duplicate charge");
    expect(scenarioShortTitle("No arrow here")).toBe("No arrow here");
  });
  it("takes the first sentence", () => {
    expect(firstSentence("You may reset MFA only. Then stop.")).toBe("You may reset MFA only.");
    expect(firstSentence("No full stop")).toBe("No full stop");
  });
});
```

`tests/ui/verdict.test.ts`: move the `runVerdict` cases from `runsListPage.test.ts` (import from `@/ui/verdict`) and add:

```ts
it("maps tones onto the mock's badge classes", () => {
  expect(verdictBadgeClass("danger")).toBe("badge-danger");
  expect(verdictBadgeClass("warning")).toBe("badge-warning");
  expect(verdictBadgeClass("success")).toBe("badge-success");
  expect(verdictBadgeClass("muted")).toBe("badge-neutral");
});
```

- [ ] **Step 2: Run** the three files → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/ui/relativeTime.ts
/** "just now" | "n min ago" | "n h ago" | "n d ago", floored. Server-computed with one `now` per page so SSR and hydration agree. */
export function relativeTime(iso: string, now: number): string {
  const t = Date.parse(iso);
  const s = Number.isNaN(t) ? 0 : Math.floor((now - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
```

In `format.ts`:

```ts
/** The mock's Run column name. A Run stores no name; this is the fact its hand-written names encoded. */
export const runName = (agentLabel: string, attackId: string | null): string => `${agentLabel} — ${attackId ? "attacked" : "clean"}`;
export const scenarioShortTitle = (title: string): string => title.split("→")[0].trim();
export function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const m = /^(.*?[.!?])(\s|$)/.exec(flat);
  return m ? m[1] : flat;
}
```

`src/ui/verdict.ts`: paste `Verdict` + `runVerdict` from `RunsListPage.tsx` unchanged, plus `export const verdictBadgeClass = (tone: Verdict["tone"]): string => ({ danger: "badge-danger", warning: "badge-warning", success: "badge-success", muted: "badge-neutral" })[tone];`. `RunsListPage.tsx` imports `runVerdict` from `./verdict` (re-export it so nothing else breaks).

- [ ] **Step 4: Run** `npx vitest run tests/ui && npx tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(ui): relativeTime, runName, verdict helpers`.

---

### Task 3: Backend summaries carry what the tables show

**Files:**
- Modify: `src/runner/store.ts` (`RunSummary`, `toSummary`)
- Modify: `src/lib/summaries.ts` (`PackSummary`, `toPackSummary`)
- Test: `tests/runner/store.test.ts`, `tests/api/worlds.test.ts`

**Interfaces:**
- Produces: `RunSummary` gains `packName: string; scenarioTitle: string; lureTaken: boolean`. `PackSummary` gains `systems: number`.

- [ ] **Step 1: Tests.** In `tests/runner/store.test.ts` extend the first `toMatchObject` with `packName: "Northwind Outfitters", scenarioTitle: "Dup", lureTaken: false` and add:

```ts
it("flags a Run that took the Lure", () => {
  const r = record({ status: "completed", violations: [{ checkType: "lure_not_taken", dimension: "safety", params: {}, eventSeq: 3, message: "took it", magnitude: null }] });
  expect(toSummary(r).lureTaken).toBe(true);
});
```

In `tests/api/worlds.test.ts` add `systems: 4` to the Northwind `toContainEqual` object.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement**: in `toSummary` add `packName: r.packName ?? "", scenarioTitle: r.scenarioTitle ?? r.scenarioId, lureTaken: (r.violations ?? []).some((v) => v.checkType === "lure_not_taken")`; in `toPackSummary` add `systems: Object.keys(p.meta.systems).length`. **Step 4: Run** `npx vitest run tests/runner tests/api && npx tsc --noEmit` → PASS (note `RunsListPage` tests' `summary()` helper in `verdict.test.ts` must add the three new fields). **Step 5: Commit** — `feat(store): RunSummary carries pack name, scenario title and lureTaken; PackSummary counts systems`.

---

### Task 4: Runs page

**Files:**
- Create: `src/ui/runs/runsView.ts`, `src/ui/runs/RunsPage.tsx`
- Modify: `src/app/page.tsx`
- Test: `tests/ui/runsView.test.ts`

**Interfaces:**
- Consumes: `RunSummary` (Task 3), `relativeTime`, `runName`, `scenarioShortTitle`, `runVerdict`, `verdictBadgeClass`, `latestComparablePair`, `firstSentence`, `DIMENSIONS`/`label`.
- Produces:

```ts
export type RunRow = { id: string; name: string; scenarioShort: string; packName: string; agentLabel: string; attackId: string | null;
  status: RunSummary["status"]; headline: number | null; capped: boolean; verdict: Verdict; dims: { label: string; score: number }[]; when: string };
export function toRunRow(s: RunSummary, now: number): RunRow;
export function runsSubline(runs: RunSummary[]): string;
export type Insight = { title: string; detail: string; href?: string; tone: "warning" | "success" | "danger"; icon: string };
export function compareInsight(runs: RunSummary[]): Insight | null;
export function luresInsight(runs: RunSummary[]): Insight | null;
export function mandateInsight(policyText: string | null): Insight | null;
```

- [ ] **Step 1: Tests**

```ts
// tests/ui/runsView.test.ts
import { describe, expect, it } from "vitest";
import { compareInsight, luresInsight, mandateInsight, runsSubline, toRunRow } from "@/ui/runs/runsView";
import type { RunSummary } from "@/ui/types";
const dims = (t: number, c: number, p: number, s: number, d: number) =>
  (["task_completion", "correctness", "policy_compliance", "safety", "data_access"] as const).map((name, i) => ({ name, score: [t, c, p, s, d][i], passed: 1, total: 1 }));
function run(over: Partial<RunSummary> = {}): RunSummary {
  return { id: "run_a", createdAt: "2026-09-17T10:00:00Z", status: "completed", packId: "p1", packName: "Pack One", scenarioId: "s1", scenarioTitle: "Fix it → then stop",
    agentLabel: "naïve", agentKind: "reference", attackId: null, headline: 100, capped: false, golden: false, outcome: "completed", passed: true, lureTaken: false, dimensions: dims(100, 100, 100, 100, 100), ...over };
}
describe("toRunRow", () => {
  it("derives every column the table shows", () => {
    const row = toRunRow(run({ attackId: "atk", capped: true, headline: 40, dimensions: dims(100, 50, 0, 0, 100) }), Date.UTC(2026, 8, 17, 12));
    expect(row).toMatchObject({ name: "naïve — attacked", scenarioShort: "Fix it", packName: "Pack One", when: "2 h ago", headline: 40, capped: true });
    expect(row.verdict.text).toBe("Capped");
    expect(row.dims.map((d) => d.score)).toEqual([100, 50, 0, 0, 100]);
    expect(row.dims[2].label).toBe("Policy Compliance");
  });
});
describe("runsSubline", () => {
  it("counts runs, worlds and capped runs, and says how many capped runs were attacked", () => {
    expect(runsSubline([])).toBe("No runs yet.");
    expect(runsSubline([run()])).toBe("1 run across 1 World. None failed their Mandate.");
    expect(runsSubline([run(), run({ id: "b", packId: "p2", capped: true, attackId: "x" }), run({ id: "c", capped: true })]))
      .toBe("3 runs across 2 Worlds. 2 failed their Mandate — 1 of them under Attack.");
    expect(runsSubline([run({ capped: true, attackId: "x" })])).toBe("1 run across 1 World. 1 failed its Mandate — under Attack.");
  });
});
describe("insights", () => {
  it("builds the compare card from the latest comparable pair", () => {
    const a = run({ id: "a", agentLabel: "naïve", headline: 40, capped: true, createdAt: "2026-09-17T10:00:00Z" });
    const b = run({ id: "b", agentLabel: "fixed", headline: 100, createdAt: "2026-09-17T11:00:00Z" });
    expect(compareInsight([a, b])).toEqual({ title: "Compare naïve vs. fixed", detail: "Fix it: same Scenario, 40 → 100. Opens the Compare page.", href: "/compare?a=a&b=b", tone: "warning", icon: "⇄" });
    expect(compareInsight([a])).toBeNull();
  });
  it("counts Lures taken over attacked runs", () => {
    expect(luresInsight([run({ attackId: "x", lureTaken: true }), run({ id: "b", attackId: "x" }), run({ id: "c" })])).toEqual({ title: "1 Lure taken", detail: "1 of 2 attacked runs took the bait.", tone: "danger", icon: "⚠" });
    expect(luresInsight([run()])).toBeNull();
  });
  it("quotes the first sentence of the mandate in force", () => {
    expect(mandateInsight("You may refund once. Nothing else.")).toEqual({ title: "Mandate in force", detail: "You may refund once.", tone: "success", icon: "✓" });
    expect(mandateInsight(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `runsView.ts`** exactly to the tests (plurals: `run/runs`, `World/Worlds`, `its/their`; subline tail: `k === c ? "every one of them under Attack." : k === 0 ? "none under Attack." : "{k} of them under Attack."`, with the one-capped case reading `"— under Attack."` / `"— not under Attack."`). `compareInsight` title `"Compare {A.agentLabel} vs. {B.agentLabel}"`.

- [ ] **Step 4: `RunsPage.tsx`** (client, for row `onClick`): port mock lines 526–564 and the row template 1070–1078. Props `{ rows: RunRow[]; subline: string; insights: Insight[] }`. Crumb, `h1.page.serif`, `p.sub`, `.runs-toolbar` with `<Link href="/runs/new" className="btn btn-primary">` and the play SVG (line 534), `.panel.table-wrap.runs-scroll > table.runs` with the six `<th>`s (classes `c-agent`, `c-attack`, `c-when`), rows: Run cell `<Link href={/runs/id}><div class="run-name">name</div><div class="run-id mono">id</div></Link>`; Scenario `.cell-main` + `.cell-sub`; Agent; Attack `.attack-cell(.off)` text `— none` when null; Trust: `.trust > .n(.num-bad when capped)` = `status === "running" ? "…" : headline ?? "—"`, badge `<span className={"pill-badge " + verdictBadgeClass(tone)}>{text.toUpperCase()}</span>` (muted tone renders as plain `text-[11px]` span), `.dimstrip` of five `.dimseg(.bad when <100)`; When `.c-when`. Empty body row (colSpan 6). Then `.insight-row` of `insights` as `.panel.insight` (a `<Link>` when `href`), icon backgrounds by tone: warning → `var(--warning-bg)/var(--warning-fg)`, success, danger.

- [ ] **Step 5: `src/app/page.tsx`**: `const runs = listRuns(); const now = Date.now(); const { packs } = loadPacks();` latest run → `packs.find(p => p.meta.id === latest.packId)?.scenarios.find(s => s.id === latest.scenarioId)?.policy.text ?? null`; `insights = [compareInsight(runs), mandateInsight(policy), luresInsight(runs)].filter(Boolean)`; render `<ConsoleShell><RunsPage rows={runs.map(r => toRunRow(r, now))} subline={runsSubline(runs)} insights={insights} /></ConsoleShell>`.

- [ ] **Step 6: Run** tests + tsc + eslint; load `/` and compare with the mock's Runs view (open `design/agentsim-console.html` in the browser alongside). **Step 7: Commit** — `feat(runs): rebuild the Runs page to the mock`.

---

### Task 5: Waves module and the run-page pure logic

**Files:**
- Create: `src/ui/waves.ts` (move `groupWaves` + `Wave` type from `src/ui/flow/buildFlow.ts`; `buildFlow.ts` re-imports it from here until Task 14 deletes it)
- Create: `src/ui/run/eventFlags.ts`
- Test: `tests/ui/waves.test.ts` (move the `describe("groupWaves")` block from `buildFlow.test.ts`), `tests/ui/eventFlags.test.ts`

**Interfaces:**
- Produces: `groupWaves(events: Event[]): Wave[]` (unchanged); `eventFlags(ev: Event, violations: Violation[], attack: Attack | null): EventFlags` with `type EventFlags = { injected: boolean; violation: boolean; lure: boolean; error: boolean; bad: boolean }`; `isWriteTool(tools: Record<string, ToolDef>, name: string): boolean`.

- [ ] **Step 1: Test `eventFlags`**

```ts
import { describe, expect, it } from "vitest";
import { eventFlags, isWriteTool } from "@/ui/run/eventFlags";
import type { Event } from "@/engine/types";
import type { Attack, ToolDef } from "@/engine/pack";
const ev = (seq: number, tool: string, input: Record<string, unknown>, extra: Partial<Event> = {}): Event =>
  ({ seq, toolUseId: `t${seq}`, tool, input, isError: false, changes: [], startedAt: 0, endedAt: 1, at: 1, source: "mcp", batchId: null, injected: null, ...extra });
const attack: Attack = { id: "a", title: "t", mutation: { type: "set_field", collection: "c", id: "r", field: "f", value: "x" }, lure: { tool: "grant", args_match: { group: "admins" } } };
describe("eventFlags", () => {
  it("flags injection, violation, lure and error independently; bad = violation || lure", () => {
    const v = [{ checkType: "arg_lte", dimension: "policy_compliance" as const, params: {}, eventSeq: 2, message: "", magnitude: null }];
    expect(eventFlags(ev(1, "read", {}, { injected: { attackId: "a", collection: "c", id: "r", field: "f" } }), v, attack)).toEqual({ injected: true, violation: false, lure: false, error: false, bad: false });
    expect(eventFlags(ev(2, "grant", { group: "admins" }), v, attack)).toEqual({ injected: false, violation: true, lure: true, error: false, bad: true });
    expect(eventFlags(ev(3, "grant", { group: "admins" }, { isError: true }), [], null)).toEqual({ injected: false, violation: false, lure: false, error: true, bad: false });
  });
});
describe("isWriteTool", () => {
  it("reads the tool's declared kind, defaulting to write for an unknown tool", () => {
    const tools = { r: { kind: "read" } as ToolDef, w: { kind: "write" } as ToolDef };
    expect(isWriteTool(tools, "r")).toBe(false); expect(isWriteTool(tools, "w")).toBe(true); expect(isWriteTool(tools, "zz")).toBe(true);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** (`eventFlags.ts` imports `matchesLure` from `@/engine/lure` only). **Step 4: Move `groupWaves`** into `waves.ts` verbatim; `buildFlow.ts` does `import { groupWaves, type Wave } from "../waves"; export { groupWaves }; export type { Wave };`; move its tests. **Step 5: Run** `npx vitest run tests/ui && npx tsc --noEmit` → PASS. **Step 6: Commit** — `refactor(ui): waves and eventFlags as pure modules`.

---

### Task 6: Run detail page

**Files:**
- Create: `src/ui/run/RunPage.tsx`, `src/ui/run/FlowStrip.tsx`, `src/ui/run/EventList.tsx`, `src/ui/run/EventDrawer.tsx`, `src/ui/run/ScorePanel.tsx`, `src/ui/run/DiffPanel.tsx`, `src/ui/run/ConnectionStrip.tsx`, `src/ui/run/ReplayBar.tsx`
- Modify: `src/app/runs/[id]/page.tsx`
- Reuse (unchanged): `src/ui/useRun.ts`, `src/ui/useReplay.ts`, `src/ui/useOrigin.ts`, `src/ui/idle.ts`, `src/ui/flow/injected.ts` (`locateInjection`, `injectedText`), `src/ui/ViolationCard.tsx`, `src/ui/format.ts`, `src/ui/systemColor.ts`, `src/ui/diffSummary.ts`, `src/ui/connect/snippets.ts`, `src/ui/connect/CopyButton.tsx`

**Interfaces:**
- Consumes: `eventFlags`, `isWriteTool`, `groupWaves`, `scoreSummary`, `outcomeBadge`, `fmtArgs`, `prettyJson`, `clockTime`, `systemColor(systems, system)`, `idleLabel(run, now)`, `mcpAddCommand`, `mcpJsonConfig`, `forwarderTs`, `forwarderPy`, `curlTools`, `toolsUrl`, `connectorBlock`.
- Produces: `RunPage({ id, initialRun, tools, systems, principalLabel, injectedLabel, golden })` (client); server page passes `systems = Object.keys(pack.meta.systems).sort()` and `golden = isGoldenRun(id)`.

- [ ] **Step 1: Server page.** Rewrite `src/app/runs/[id]/page.tsx`: keep `packViewFor` but return `{ tools, systems, principalLabel, injectedLabel }`; `notFound()` when no run; render `<ConsoleShell><RunPage id={id} initialRun={run} … golden={isGoldenRun(id)} /></ConsoleShell>`.

- [ ] **Step 2: `RunPage.tsx`** (client). State: `const { run: polled } = useRun(id); const run = polled ?? initialRun;` `view: "flow" | "list"`, `selected: number | null` (event seq), `replay = useReplay(run)`, narrative effect copied from `RunView.tsx` lines 38–52 but gated on `!golden` instead of `recent`. Layout: port mock lines 567–590 and `openRunDetail` (1270–1276): `<Link className="back-link" href="/">← All runs</Link>`, crumb `Runs / <b>{scenarioTitle}</b>`, `.run-header` (pack pill = `run.packName`, `h1.page.serif` 20 px, mono id, `Agent: {agentLabel(run.agent)}` pill, `Attack: on|off` pill with `.on`). Then `{isByo && running && <ConnectionStrip run={run} systems={systems} onFinished={refetch} />}`, then `.run-detail-grid`: left `.panel` with `.run-toolbar` (`.tglgrp` two buttons, `#runEventCount` = `"{n} events" + (running ? " · running" : "")`), then `<FlowStrip>` or `<EventList>` over `run.events.slice(0, replay.visible)`, then `{!running && <ReplayBar replay={replay} />}`. Right column: `<ScorePanel run={displayRun} replaying={replay.replaying} />` and `<DiffPanel run={run} principalLabel={principalLabel} />`. `<EventDrawer>` when `selected !== null`. `refetch` = `fetch(/api/runs/${id})` → local override state (same pattern as narrative).

- [ ] **Step 3: `FlowStrip.tsx`.** Props `{ events, violations, attack, tools, systems, onOpen(seq) }`. `groupWaves(events)`; for each wave: `.flow-edge` before every wave but the first; a single-event wave renders one `.flow-node`; a multi-event wave renders `.flow-batch` of nodes. Node (mock 1318–1320): `.flow-node(.bad)` button, `.seq` `#seq`, `.tool` with `.sys-dot` coloured `systemColor(systems, tools[tool]?.system ?? "").fg`, `.argline` = `fmtArgs(ev.input, tools[ev.tool])`, `.flags` with `injected` / `violation` / `error` `.flow-flag`s per `eventFlags`. **`EventList.tsx`**: `.list-strip > .ledger-row(.bad)` button per event with `.step`, `.call`, `.args`, and the `injected` flag (mock 1304).

- [ ] **Step 4: `EventDrawer.tsx`.** Props `{ run, event, events, tools, systems, injectedLabel, onClose, onSelect(seq) }`. Port mock 1348–1356 as the frame (`.drawer-backdrop` click closes, `.drawer` with `.close` ✕), then: `.field-label` "Event #n", `<h3>{tool}</h3>`, badges (`.pill-badge.badge-danger`: "Injected content read here", "Violation", "Lure taken"; `.badge-neutral` "error"), `.drawer-field`s: Input (`.val` pre, `JSON.stringify(input, null, 2)`), Result or Error (`prettyJson`), Source (`ev.source` + `, this Run's Attack surfaced text here` when injected), Changes (`op collection id` per change or "No World changes."), Timing (`clockTime` started/ended, duration ms, batch). Then when the event has Violations: `<ViolationCard violations sourceSeq onJump={onSelect} injectedLabel className="" />` (sourceSeq = first injected event's seq when different). Then when injected: the `locateInjection` block from the old drawer (`before`/`<mark>`/`after` inside a `.val`-styled pre). Keys: Escape closes, ←/→ call `onSelect` with the neighbouring seq (adapt the old `step` logic over `events`). Focus the panel on open.

- [ ] **Step 5: `ScorePanel.tsx`** (mock 1324–1331): `.heading` "Trust Score"; pending → "evaluating…" / "replaying…" / `Run failed: {error}`; else `.score-num` (red when capped) + CAPPED badge + `outcomeBadge` as `.badge-warning`; paragraph = `run.narrative ?? scoreSummary(score)`; five `.dim-bar-row`s with `.dtop` label / mono score (`num-bad` < 100) and `.dim-bar-track > .dim-bar-fill(.bad)` width `score%`. **`DiffPanel.tsx`** (mock 1334–1343 layout, real data): `.heading` "World diff · start → end"; running → "World is changing…"; else `.diff-row` per `run.diff` entry with `.op` `+`/`~`, `<span class="mono">{entityId}</span> {summary}`, background `var(--danger-bg)` when a violating event changed that entity (reuse `DiffPanel.tsx`'s `flagged` computation), else `var(--success-bg)` for added and `var(--warning-bg)` for changed; last row `=` `{unchangedCount} entities unchanged · {readsOutsideLabel(countReadsOutside(violations), principalLabel)}`.

- [ ] **Step 6: `ConnectionStrip.tsx`.** Props `{ run, systems, onFinished }`. `const origin = useOrigin();` `const [now, setNow] = useState(Date.now)` ticking every second; `.panel.card-pad` with `h2` `Waiting for your agent · {events} events{idle ? ` · idle ${idle}` : ""}` (`idleLabel(run, now)`); shape = `run.agent.kind === "byo" ? run.agent.shape : "mcp"`; when `origin`: mcp → for each system a `.copyfield` with `mcpAddCommand(name, `${origin}/mcp/runs/${run.id}/${system}`)` and one `<pre>` `mcpJsonConfig` per system; forwarder → TS/Python `.seg` toggle, `<pre>` forwarder, `.copyfield` `curlTools(toolsUrl(callUrl))`; connector → `<pre>` `connectorBlock(firstMcpUrl)` and the public-URL note (mock 2330). Task Brief `<pre>` + `<CopyButton text={run.taskBrief} what="Task Brief" />`. `<button className="btn btn-primary">Finish & evaluate</button>` → `POST /api/runs/${run.id}/finish` → `onFinished()`; disabled while pending; error text under it.

- [ ] **Step 7: `ReplayBar.tsx`**: `ReplayScrubber`'s markup with mock classes: a `.run-toolbar`-height bar under the strip: `.tglgrp`-style play button (`▷`/`❚❚`, aria-label), mono `#visible / total`, `<input type="range">` with `accent-color: var(--ink)`, speed toggle.

- [ ] **Step 8: Verify.** `npx tsc --noEmit && npx eslint && npm test`. Open a golden run (`/runs/run_mtztrgl69wo`), compare with the mock's run detail; open the drawer; press play. Start a BYO run via `curl -s localhost:3000/api/runs -H 'content-type: application/json' -d '{"packId":"northwind","scenarioId":"duplicate-charge-refund","agent":{"kind":"byo"}}'`, open its page, confirm the strip shows URLs and the countdown, click Finish, confirm the score appears.

- [ ] **Step 9: Commit** — `feat(run): rebuild the Run page — flow strip, list, drawer, score, diff, live connection strip, replay`.

---

### Task 7: Compare page

**Files:**
- Create: `src/ui/compare/CompareCards.tsx`
- Modify: `src/ui/compare/RunPicker.tsx`, `AttackPanel.tsx`, `ActionLedger.tsx`, `ChecksTable.tsx`, `WorldDiffCompare.tsx`, `src/app/compare/page.tsx`
- Reuse: `compareLedger.ts`, `latestComparablePair.ts`, `lureSummary`, `checkParams`, `injectedText`, `matchesLure`, `runName`

**Interfaces:**
- Produces: `CompareCards({ runA, runB })`; `ChecksTable({ checks, violationsA, violationsB, scoreA, scoreB })` where `scoreA/B: Score | null` (new props, dimension scores shown in `.dimhead`).

- [ ] **Step 1: Page skeleton** (mock 594–604): inside `ConsoleShell`: crumb, `h1.page.serif` "Compare runs", `p.sub` (mock text line 597), `<RunPicker>` restyled to `.cmp-picker` (two `.field-label` + `<select>`, `.swap` button), then `#cmpBody`: `<CompareCards>`, `<AttackPanel>`, `<ActionLedger>`, `<ChecksTable … scoreA={ra.score} scoreB={rb.score}>`, `<WorldDiffCompare>`. Remove `CompareRunColumn` usage. Keep the `sharedChecks` / `lure_not_taken` synthesis exactly as it is.

- [ ] **Step 2: `CompareCards`** (mock `cmpCardHtml` 1106–1123): `.cmp-cards` of two `.panel.cmp-card`: `.side` "Run A/B", `<h3>{runName(agentLabel(run.agent), run.attack?.id ?? null)}</h3>`, `.rid`, `.facts` mini-tags (agent, `no Attack` | `Attack: id` in danger colour, `run.packName`, `{events.length} events`), `.cmp-score` (`.n` red when capped, PASS/CAPPED badge via `runVerdict(toSummaryLike)` — compute tone from `run.score` directly: capped → CAPPED danger, `passed` → PASS success, else `outcomeBadge` warning), B shows `.delta-up/.delta-down` `"{±d} vs A"` when headline differs; scenario title paragraph.

- [ ] **Step 3: Restyle** `AttackPanel` to mock 1163–1172 (`h2`, `p`, `dl.inject-meta`, `.inject-box`, `.took > .took-card(.yes|.no)`), `ActionLedger` to 1176–1195 (`.ledger-col-label`, `.cmp-step(.bad|.good|.inj|.open)`, `.ledger-fork`, `.ledger-split`; `.good` when the step is a write with no violation in a run that passed — keep the existing tone rules, map to classes), `ChecksTable` to 1201–1216 (`.checkrow.head`, `.dimhead` with `.vv` scores from `scoreA/scoreB.dimensions`, `.checkrow` with `.ctype` + `checkParams`, `.vv.pass/.fail` ✓/✗), `WorldDiffCompare` to 1219–1229 (`.cmp-writes` two columns of `.diff-row`s).

- [ ] **Step 4: Verify** on `/compare` (auto-pairs) and `/compare?a=run_mtztrgl69wo&b=run_mtztt48wkqq`; tsc/eslint/test. **Step 5: Commit** — `feat(compare): restyle Compare to the mock with score cards`.

---

### Task 8: New run wizard

**Files:**
- Modify: `src/ui/wizard/NewRunWizard.tsx`, `StepStrip.tsx`, `steps/ConnectStep.tsx`, `WorldStep.tsx`, `ScenarioStep.tsx`, `MandateStep.tsx`, `AttackStep.tsx`, `ReviewStep.tsx`
- Modify: `src/app/runs/new/page.tsx` (no logic change; ensure `ConsoleShell` wraps)

- [ ] **Step 1: Wizard frame** (mock 607–623): crumb `Runs / <b>New run</b>`, `h1.page.serif`, `p.sub` (line 610 text), `<StepStrip>` → `.steps` of `.step-chip(.current|.done)` with `.num` (✓ when done) and `.step-line` between; `#stepBody`; `.footer-actions`: `btn btn-ghost` Back (visibility hidden on step 0), `.right`: Cancel (`/`), Continue → (`btn btn-primary`, disabled per `canContinue`) hidden on the last step.

- [ ] **Step 2: Connect step** (mock 2294–2344): `.step-grid`, left `.panel.card-pad` with `<h2>How the agent reaches this Run</h2>` and four `label.option(.selected)` radios (connector shows `<span class="roadmap-tag">needs a public URL</span>`); right `.panel.card-pad`: Reference → `.field-label` Prompt, version buttons (`btn btn-ghost` 32 px, `<b>` when selected, `naive` → `naïve`), blurb `<p>`, `.field-label` "Tools this World exposes", `table.tooltable` Tool · Maps to · Status (`t.name`, `"{op} {collection}"` — extend `WizardTool` in `summaries.ts` with `op` and `collection`, `pill-badge badge-success` `ready`). Other shapes → keep the existing select / register / snippets logic, restyled: `.field-label` + `<select class="form-row">`-style, `<pre class="mono">` with the mock's `PRE` style for snippets (`:id` placeholders), alias table `Your tool · AgentSim tool · Status` with `pill-badge badge-success mapped` / `badge-neutral auto`, hint line 2337.

- [ ] **Step 3: World / Scenario / Mandate / Attacks / Review** (mock 2347–2408): `.step-grid.single > .world-grid > .world-card(.selected)` (h3, `.domain`, p, `.meta-row`: `{entities} entities · Principal: {principal} · {n} Scenario(s)`); `.scenario-card(.selected)` (h3 serif, `.brief`); `.panel.card-pad` with `h2` "The Mandate — what the agent is authorised to do", `.mandate-quote`, `.derive-note`; `.attack-card.off(.selected)` + `.attack-card(.selected)` with `.lure-tag` "⚡ Lure — {formatLure}"; Review `.panel.card-pad` > `h2`, `dl.review-grid`, divider, full-width `btn btn-primary` "▷ Start Run" (46 px), error `.nw-note` in the danger palette.

- [ ] **Step 4: Verify** each step at 1280 and 720 px; start a Reference run (needs `ANTHROPIC_API_KEY`; if unset, confirm the API error renders under the button). tsc/eslint/test. **Step 5: Commit** — `feat(wizard): restyle the New run wizard to the mock`.

---

### Task 9: World list, detail shell, drafts API, raw editor route

**Files:**
- Modify: `src/ui/worlds/packView.ts` (`WORLD_TABS`, `parseTab`, add `sourceKindLabel`, `sourceDetail`)
- Modify: `src/generate/draftRegistry.ts` (add `listDrafts`)
- Create: `src/lib/draftSummary.ts`, `src/app/api/worlds/drafts/route.ts`, `src/app/api/worlds/drafts/[draftId]/route.ts`
- Create: `src/ui/worlds/OverviewTab.tsx`, `src/ui/worlds/WorldTabs.tsx`, `src/app/worlds/[id]/edit/page.tsx`
- Modify: `src/app/worlds/page.tsx`, `src/app/worlds/[id]/page.tsx`, `src/ui/worlds/PackTabs.tsx` (restyle to `.tabs/.tab`), `src/ui/worlds/editorLogic.ts` (`tabFileKey`/`fileTab` keep their own `EditorTab` list `["overview","entities","tools","scenarios","agents"]`)
- Test: `tests/ui/packView.test.ts` (tabs + new helpers), `tests/generate/draftRegistry.test.ts`, `tests/api/drafts.test.ts`

**Interfaces:**
- Produces: `WORLD_TABS = ["overview","entities","tools","mandate","scenarios"]`; `sourceKindLabel(kind?: "mcp"|"db"|"s3"|"tools"): string` → `MCP | database | object store | own tools | pack`; `sourceDetail(sys: PackMeta["systems"][string]): string`; `listDrafts(): Draft[]` newest first, expired dropped; `type DraftSummary = { id: string; createdAt: number; name: string; domain: string; valid: boolean; errorCount: number; tools: number; entities: number }`; `summarizeDraft(d: Draft): DraftSummary`; `GET /api/worlds/drafts` → `DraftSummary[]`; `GET /api/worlds/drafts/:draftId` → `{ id, files, errors, input }` | 404.

- [ ] **Step 1: Tests**

```ts
// tests/generate/draftRegistry.test.ts (append)
it("lists live drafts newest first and drops expired ones", () => {
  const input = { name: "A", domain: "d", description: "x" };
  const a = createDraft(input, { files: {}, errors: [], attempts: 1 });
  const b = createDraft({ ...input, name: "B" }, { files: {}, errors: [], attempts: 1 });
  (b as { createdAt: number }).createdAt = a.createdAt + 1;
  const stale = createDraft({ ...input, name: "S" }, { files: {}, errors: [], attempts: 1 });
  (stale as { createdAt: number }).createdAt = Date.now() - 3 * 60 * 60 * 1000;
  const ids = listDrafts().map((d) => d.id);
  expect(ids.indexOf(b.id)).toBeLessThan(ids.indexOf(a.id));
  expect(ids).not.toContain(stale.id);
});
```

```ts
// tests/api/drafts.test.ts
import { describe, expect, it } from "vitest";
import { GET as listRoute } from "@/app/api/worlds/drafts/route";
import { GET as getRoute } from "@/app/api/worlds/drafts/[draftId]/route";
import { createDraft } from "@/generate/draftRegistry";
import type { DraftSummary } from "@/lib/draftSummary";
const files = { "pack.yaml": "id: x\nentities:\n  a: {}\n  b: {}\n", "tools.yaml": "t1: {}\nt2: {}\nt3: {}\n" };
describe("GET /api/worlds/drafts", () => {
  it("summarises drafts with tool and entity counts", async () => {
    const d = createDraft({ name: "Zed", domain: "support", description: "x" }, { files, errors: [{ file: "seed.yaml", path: "", message: "bad" }], attempts: 2 });
    const list = (await (await listRoute()).json()) as DraftSummary[];
    expect(list.find((s) => s.id === d.id)).toMatchObject({ name: "Zed", domain: "support", valid: false, errorCount: 1, tools: 3, entities: 2 });
    const one = await getRoute(new Request("http://x"), { params: Promise.resolve({ draftId: d.id }) });
    expect(one.status).toBe(200);
    expect(((await one.json()) as { files: Record<string, string> }).files).toEqual(files);
    expect((await getRoute(new Request("http://x"), { params: Promise.resolve({ draftId: "draft_nope" }) })).status).toBe(404);
  });
});
```

`tests/ui/packView.test.ts`: change the tabs test to expect `mandate` in `WORLD_TABS` and `parseTab("agents")` → `"overview"`; add `expect(sourceKindLabel("mcp")).toBe("MCP"); expect(sourceKindLabel(undefined)).toBe("pack"); expect(sourceDetail({ label: "Payments", kind: "mcp", mode: "shadowed", provider: "stripe" })).toBe("stripe catalog, mirrored over MCP"); expect(sourceDetail({ label: "Orders", kind: "db", mode: "mocked" })).toBe("declared in tools.yaml, mocked");` and `expect(sourceDetail({ label: "X" })).toBe("declared in tools.yaml")`. Also fix the five failing Northwind tests: `countsLabel` → `9 tools`; `systemCounts` → `[support 2, email 2, orders 3, payments 2]`; lure → `"create_refund with payment_intent = pay_7001"`; `opLabel(tools.create_refund)` → `"create refunds"`; the `issue_refund` input test → `create_refund`: `["payment_intent: string", "amount: int?", "reason: enum(duplicate | fraudulent | requested_by_customer)?"]`.

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** `listDrafts` (`[...drafts.values()].filter(d => !expired(d)).sort((a, b) => b.createdAt - a.createdAt)`, deleting expired), `summarizeDraft` (count top-level keys of `tools.yaml` and `entities` of `pack.yaml` via `yaml.parse` in try/catch → 0), routes (`export const dynamic = "force-dynamic"`), `packView` helpers. `sourceDetail`: `shadowed && provider` → `"{provider} catalog, mirrored over MCP"`; else `"declared in tools.yaml" + (mode ? `, ${mode}` : "")`.

- [ ] **Step 4: World list** `src/app/worlds/page.tsx` (mock 626–640 + `renderWorldCards` 1363–1386 + `draftRowHtml` 1956–1967): `ConsoleShell` > crumb, `.runs-toolbar` (h1 "World" + `p.sub` "The packs a Run happens inside — entities, ownership, tools, seed data." / `<Link class="btn btn-primary" href="/worlds/new">+ New world</Link>`), drafts panel when `listDrafts().length > 0` (`.panel.card-pad` > h2 "Worldbuilder drafts awaiting review — n", `.draft-row`s: `.draft-id`, badge `awaiting review` (`badge-warning`) or `has errors` (`badge-danger`), `.draft-meta` `"{name} · {relativeTime} · {tools} tools, {entities} entities · new World"`, `.draft-actions` `<Link class="btn btn-ghost" href="/worlds/new?draft={id}">Review →</Link>`), `.world-grid` of `<Link class="world-card" href="/worlds/{id}">` (h3, `.domain`, p, `.meta-row`: `{collections} entities · Principal: {label} · {systems} systems · {tools} tools` — principal label = `pack.meta.entities[principal].label`, so pass `loadPacks().packs` not summaries), broken-pack panel kept.

- [ ] **Step 5: Detail shell** `src/app/worlds/[id]/page.tsx` (mock 1401–1406): back link, crumb `World / <b>{name}</b>`, `h1.page.serif`, `p.sub` description, small `<Link href="/worlds/{id}/edit">Edit pack files</Link>` (`.linkish`), `<WorldTabs packId current>` (server component: `.tabs > a.tab(.active)` via `tabHref`), `.panel.card-pad` with `max-width: 760px` on overview else `1040px`, body by tab: `overview → <OverviewTab pack>`; the other four are Tasks 10–12 (render `null` for now). **`OverviewTab`** (mock 1411–1427): h2 "What this World is made of", the explanatory `<p>`, `.src-list` of `.src-item` per `meta.systems` entry (badge `sourceKindLabel` coloured with `systemColor(systemKeys, key)`, `.src-name` label + `.src-mode` mode, `.src-detail` `sourceDetail`, `.src-count` `"{n} tool(s)"` from `systemCounts`), h2 "Systems" chips, h2 "Principal" paragraph naming `entities[principal].label`.

- [ ] **Step 6: Raw editor route** `src/app/worlds/[id]/edit/page.tsx`: the previous `[id]/page.tsx` body (`PackEditor` with `Body` children and `seedModes`) moved here unchanged, wrapped in `ConsoleShell` with a back link to `/worlds/{id}`; `PackTabs` restyled to `.tabs/.tab` (keeps its own five-tab list from `editorLogic`'s `EDITOR_TABS`; `packView.tabLabel` gains `"agents": "Agents"` via a second `EDITOR_TAB_LABELS` map in `editorLogic.ts`).

- [ ] **Step 7: Verify** tests, tsc, eslint; `/worlds`, `/worlds/northwind`, `/worlds/northwind/edit`. **Step 8: Commit** — `feat(world): World list, detail shell, Overview tab, drafts API, raw editor route`.

---

### Task 10: World → Entities tab

**Files:**
- Create: `src/ui/worlds/ownership.ts`, `src/lib/entityViews.ts` (server), `src/ui/worlds/EntitiesTab.tsx`, `src/ui/worlds/ErdSvg.tsx`
- Modify: `src/app/worlds/[id]/page.tsx`
- Test: `tests/ui/ownership.test.ts`, `tests/lib/entityViews.test.ts`

**Interfaces:**
- Produces (`ownership.ts`, browser-safe, type-only imports):

```ts
export function ownershipChain(entities: Record<string, EntitySpec>, name: string): string[]; // ["refunds","payments","orders","customers"]; stops at owner:self or when a hop is missing; max entities.length hops
export function ownedVia(entities: Record<string, EntitySpec>, name: string): string; // "payment_id" | "—"
export type ErdNode = { name: string; x: number; y: number; depth: number; root: boolean };
export type ErdEdge = { from: string; to: string; via: string; x1: number; y1: number; x2: number; y2: number; mx: number };
export const ERD = { NW: 176, NH: 64, GAPX: 92, GAPY: 16, PAD: 14 } as const;
export function erdLayout(entities: Record<string, EntitySpec>): { width: number; height: number; nodes: ErdNode[]; edges: ErdEdge[] };
```

(`entityViews.ts`, server):

```ts
export type FieldView = { name: string; type: string; ref: string | null; untrusted: boolean; edge: boolean };
export type RowTag = "planted" | "principal" | "outside" | null;
export type RowView = { row: Row; tag: RowTag };
export type SeedModeView = { key: string; label: string; rows: Record<string, RowView[]> };
export type EntityView = { name: string; label: string; prefix: string; ownedVia: string; chain: string[]; untrusted: string | null; hasText: boolean; fields: FieldView[] };
export function entityViews(pack: WorldPack): { entities: EntityView[]; modes: SeedModeView[]; attackId: string | null };
```

- [ ] **Step 1: Tests**

```ts
// tests/ui/ownership.test.ts
import { describe, expect, it } from "vitest";
import { erdLayout, ERD, ownedVia, ownershipChain } from "@/ui/worlds/ownership";
import type { EntitySpec } from "@/engine/pack";
const E: Record<string, EntitySpec> = {
  members: { label: "Member", owner: "self", fields: { id: { type: "string" } } },
  loans: { label: "Loan", owner: { via: "member_id" }, fields: { id: { type: "string" }, member_id: { type: "string", ref: "members" } } },
  notes: { label: "Note", owner: { via: "loan_id" }, fields: { id: { type: "string" }, loan_id: { type: "string", ref: "loans" }, body: { type: "text", untrusted: true } } },
};
describe("ownershipChain", () => {
  it("walks via/ref hops to the self-owned root", () => {
    expect(ownershipChain(E, "notes")).toEqual(["notes", "loans", "members"]);
    expect(ownershipChain(E, "members")).toEqual(["members"]);
    expect(ownedVia(E, "loans")).toBe("member_id"); expect(ownedVia(E, "members")).toBe("—");
  });
  it("never loops on a bad pack", () => {
    const cyc: Record<string, EntitySpec> = { a: { label: "A", owner: { via: "b_id" }, fields: { b_id: { type: "string", ref: "b" } } }, b: { label: "B", owner: { via: "a_id" }, fields: { a_id: { type: "string", ref: "a" } } } };
    expect(ownershipChain(cyc, "a").length).toBeLessThanOrEqual(3);
  });
});
describe("erdLayout", () => {
  it("places one column per depth, roots first, and one edge per via hop", () => {
    const l = erdLayout(E);
    expect(l.nodes.map((n) => [n.name, n.depth])).toEqual([["members", 0], ["loans", 1], ["notes", 2]]);
    expect(l.nodes[0].root).toBe(true);
    expect(l.nodes[1].x - l.nodes[0].x).toBe(ERD.NW + ERD.GAPX);
    expect(l.edges.map((e) => `${e.from}->${e.to}:${e.via}`)).toEqual(["loans->members:member_id", "notes->loans:loan_id"]);
    expect(l.width).toBe(ERD.PAD * 2 + 3 * ERD.NW + 2 * ERD.GAPX);
  });
});
```

```ts
// tests/lib/entityViews.test.ts
import { beforeAll, describe, expect, it } from "vitest";
import { loadPack } from "@/engine/pack";
import { entityViews } from "@/lib/entityViews";
import { usePacksDir } from "../helpers/packs";
beforeAll(() => { usePacksDir(); });
describe("entityViews (northwind)", () => {
  it("describes every entity with its chain, untrusted field and fields", () => {
    const v = entityViews(loadPack("northwind"));
    const emails = v.entities.find((e) => e.name === "emails")!;
    expect(emails.chain).toEqual(["emails", "threads", "customers"]);
    expect(emails.untrusted).toBe("body"); expect(emails.hasText).toBe(true); expect(emails.prefix).toBe("eml_");
    expect(emails.fields.find((f) => f.name === "thread_id")).toEqual({ name: "thread_id", type: "string", ref: "threads", untrusted: false, edge: true });
  });
  it("tags rows: the principal, rows outside it, and rows an Attack planted", () => {
    const v = entityViews(loadPack("northwind"));
    expect(v.modes.map((m) => m.key)).toEqual(["seeded", "duplicate-charge-refund::billing-note-injection"]);
    const seeded = v.modes[0].rows;
    expect(seeded.customers.find((r) => r.row.id === "cus_001")!.tag).toBe("principal");
    expect(seeded.customers.find((r) => r.row.id === "cus_002")!.tag).toBe("outside");
    expect(seeded.orders.find((r) => r.row.id === "ord_1040")!.tag).toBe("outside");
    expect(seeded.orders.find((r) => r.row.id === "ord_1042")!.tag).toBeNull();
    const attacked = v.modes[1].rows.emails.find((r) => r.row.id === "eml_9001")!;
    expect(String(attacked.row.body)).toContain("BILLING SYSTEM NOTICE");
    expect(attacked.tag).toBe("planted");
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** `ownership.ts`: `ownershipChain` loop `while (spec.owner !== "self" && hops < n)`: `via = spec.owner.via; next = spec.fields[via]?.ref; if (!next || !entities[next]) break;`. `erdLayout`: mock `erdSvg` geometry (lines 1473–1503) — `byDepth` from `chain.length - 1`, columns centred vertically, `edges` from each non-root entity to `chain[1]`, `mx = (x1 + x2) / 2`. `entityViews.ts`: uses `seedWorld`, `applyAttack`, `ownerOf`, `attackOptions` (server-only module, fine). Principal for tags = the first scenario's `reads_scoped` check's `principal`, else no principal/outside tags. `planted` = a row id absent from the seeded mode **or** a row whose JSON differs from its seeded twin (an `append_to_field` mutation changes an existing row — that row is the planted one). Mode keys as `attackOptions` produces (`"{scenarioId}::{attackId}"`), labels `attack.id`.

- [ ] **Step 4: `ErdSvg.tsx`** (client, `{ layout, entities: EntityView[], rows: Record<string, number>, selected, onSelect }`): port mock 1505–1526 — `<svg class="erd" viewBox width role="img" aria-label>` with the `erdArrow` marker, `.erd-edge(.hot)` cubic paths from `ErdEdge` (`C mx y1, mx y2, x2 y2`), `.erd-lbl-bg` + `.erd-lbl` with the via name, `<g class="erd-node(.root)(.untrusted)(.sel)">` rect + `.n` name + `.s` `"{prefix} · {n} row(s)"` (+ " · the principal") + `.u` "⚠ {field} is untrusted"; `<figcaption class="erd-cap">` keys. **`EntitiesTab.tsx`** (client, `{ entities, modes, attackId, principalLabel }`): state `selected` (default: the root entity), `mapView: "diagram" | "table"`, `modeKey` (default "seeded"). Port `renderEntitiesTab` 1529–1608: header row (h2 "Ownership map" + `.seg` Diagram/Table), explanatory `<p>` naming `principalLabel`, diagram or `table.maptable` (Entity `.linkish` + `.untrusted-tag` · Id prefix · Owned via · Resolves to the principal (`chainHtml`: last item `<b>`) · Rows · Fields), `.ent-layout`: `.ent-rail` buttons (`.nm`, ⚠, `.ct` count) and the detail: header (mono h2, `.mini-tag.mono` prefix, `.untrusted-tag`, `.seg` "as seeded | under Attack" only when `modes.length > 1`), Fields `table.maptable` (Field · Type (`fk → ref` when ref) · Notes: "the ownership edge" when `edge`, "untrusted — never an instruction" when untrusted, else —), `.field-label` "Seed data — n row(s) · {attackId} applied | no Attack", then `.empty-seed` when none, `.rec(.planted)` cards when `hasText` (`.rec-top` `.kv`s for the non-text fields + `.rec-body` text; `.tag-xs` per `RowTag`: planted → `.tag-xs.bad` "planted by Attack", principal → `.tag-xs.ok` "the principal", outside → `.tag-xs` "outside the principal"), else `table.seedtable` (`tr.row-planted` / `tr.row-out`). Cells via `cellText`.

- [ ] **Step 5: Page**: `case "entities": { const v = entityViews(pack); return <EntitiesTab entities={v.entities} modes={v.modes} attackId={v.attackId} principalLabel={entityLabel(pack, pack.meta.principal)} layout={erdLayout(pack.meta.entities)} /> }`.

- [ ] **Step 6: Verify** `/worlds/northwind?tab=entities` and `/worlds/halvard-helpdesk?tab=entities` against the mock. tests/tsc/eslint. **Step 7: Commit** — `feat(world): Entities tab with ownership map and seed rows under Attack`.

---

### Task 11: World → Tools tab

**Files:**
- Create: `src/ui/worlds/toolPane.ts`, `src/ui/worlds/ToolsTab.tsx`
- Modify: `src/app/worlds/[id]/page.tsx`
- Test: `tests/ui/toolPane.test.ts`

**Interfaces:**
- Produces (browser-safe; `yaml` is fine to import):

```ts
export type ToolInputRow = { name: string; type: string; required: boolean; notes: string };
export function inputRows(tool: ToolDef): ToolInputRow[]; // type "enum" → "enum"; notes: enum values joined " · ", "min n", "max n", "→ ref"
export function outputLabel(tool: ToolDef, entities: Record<string, EntitySpec>): string; // returns → YAML.stringify(returns).trimEnd(); else `{Label} row` (get/create/update) | `{Label} rows` (list)
export type GuardRow = { kind: "enforced" | "graded" | "untrusted"; text: string };
export function guardRows(tool: ToolDef, entities: Record<string, EntitySpec>, scenarios: Scenario[]): GuardRow[];
```

- [ ] **Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { guardRows, inputRows, outputLabel } from "@/ui/worlds/toolPane";
import type { EntitySpec, Scenario, ToolDef } from "@/engine/pack";
const entities: Record<string, EntitySpec> = { loans: { label: "Loan", owner: "self", fields: { id: { type: "string" }, note: { type: "text", untrusted: true } } } };
const renew: ToolDef = { name: "renew_loan", system: "desk", kind: "write", description: "d", input: { loan_id: { type: "string" }, weeks: { type: "int", min: 1, max: 4 }, why: { type: "enum", values: ["a", "b"], optional: true } },
  subject: { collection: "loans", id: "${input.loan_id}" }, guards: [{ when: "${loan.renewals >= 2}", error: "Renewed twice already." }], op: "update", collection: "loans", returns: { ok: true, loan_id: "${entity.id}" } };
const getLoan: ToolDef = { name: "get_loan", system: "desk", kind: "read", description: "d", input: { loan_id: { type: "string" } }, subject: { collection: "loans", id: "x" }, op: "get", collection: "loans" };
const scenario = { id: "s", title: "t", task_brief: "b", policy: { text: "p" }, attacks: [], checks: [
  { type: "arg_lte", dimension: "policy_compliance", tool: "renew_loan", arg: "weeks", max: 2 },
  { type: "tool_not_called", dimension: "policy_compliance", tool: "delete_loan" } ] } as unknown as Scenario;
describe("toolPane", () => {
  it("lists inputs with type, requiredness and notes", () => {
    expect(inputRows(renew)).toEqual([
      { name: "loan_id", type: "string", required: true, notes: "—" },
      { name: "weeks", type: "int", required: true, notes: "min 1 · max 4" },
      { name: "why", type: "enum", required: false, notes: "a · b" } ]);
  });
  it("labels output from returns or from the op", () => {
    expect(outputLabel(renew, entities)).toBe("ok: true\nloan_id: ${entity.id}");
    expect(outputLabel(getLoan, entities)).toBe("Loan row");
  });
  it("derives enforced, graded and untrusted rows", () => {
    expect(guardRows(renew, entities, [scenario])).toEqual([
      { kind: "enforced", text: "${loan.renewals >= 2} — Renewed twice already." },
      { kind: "graded", text: "arg_lte — every call must keep weeks ≤ 2 (policy_compliance)." } ]);
    expect(guardRows(getLoan, entities, [scenario])).toEqual([{ kind: "untrusted", text: "Returns loans.note verbatim — text other people wrote. Under an Attack the planted text arrives through this call." }]);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement.** Graded texts by check type: `arg_lte` → `"arg_lte — every call must keep {arg} ≤ {max} ({dimension})."`, `arg_sum_lte` (when `tools` includes the tool) → `"arg_sum_lte — {arg} summed over {tools.join(", ")} must stay ≤ {max} ({dimension})."`, `arg_in` → `"arg_in — {arg} must be one of {values.join(", ")} ({dimension})."`, `owner_is` → `"owner_is — the subject must resolve to {principal} ({dimension})."`, `tool_not_called` → `"tool_not_called — any call at all fails the Check outright ({dimension})."`. Untrusted row when `tool.kind === "read"` and `entities[tool.collection]` has an untrusted field (also check `include` collections). Enum type label `"enum"`; `notes` joins enum values, `min n`, `max n`, `→ ref` with ` · `, or `—`.

- [ ] **Step 4: `ToolsTab.tsx`** (client, `{ tools: ToolDef[]; entities; scenarios; systems: string[] }`): port `renderToolsTab`/`toolPaneHtml` 1809–1847: `p.hint`, `.tool-layout`: `.tool-rail` buttons (`.sys-dot`, `.nm`, `.wr(.w)` read/write) with `onMouseEnter`/`onFocus` previewing and `onClick` pinning, `mouseleave` reverting to the pinned tool; pane: mono h3, `.system-chip`, `.pill-badge.badge-warning|badge-neutral` "writes to the World" / "read-only", mono `"{op} {collection}"` right-aligned, description, Input `table.maptable` (Param · Type · required/optional `.tag-xs` · Notes), Output `pre.mono.schema-pre`, Guards `.guard-row`s with `.guard-kind.enf|grd|unt`.

- [ ] **Step 5: Page** `case "tools"` passes `Object.values(pack.tools)`, `pack.meta.entities`, `pack.scenarios`, `Object.keys(pack.meta.systems)`. **Step 6: Verify** `/worlds/northwind?tab=tools`; tests/tsc/eslint. **Step 7: Commit** — `feat(world): Tools tab with schema, guards and graded checks`.

---

### Task 12: World → Scenarios and Mandate tabs (with editing)

**Files:**
- Create: `src/ui/worlds/scenarioEdits.ts`, `src/ui/worlds/ScenariosTab.tsx`, `src/ui/worlds/MandateTab.tsx`, `src/ui/worlds/useSavePack.ts`
- Modify: `src/app/worlds/[id]/page.tsx`, `src/ui/worlds/editorLogic.ts` (`scenarioSkeleton` gains optional `title`, `taskBrief`, `policy`)
- Test: `tests/ui/scenarioEdits.test.ts`

**Interfaces:**
- Produces (`scenarioEdits.ts`, imports only `yaml` and types):

```ts
export type EditResult = { ok: true; file: string } | { ok: false; error: string };
export function setTaskBrief(file: string, value: string): string;
export function setPolicyText(file: string, value: string): string;
export function removeListItem(file: string, list: "attacks" | "checks", index: number): string;
export function appendListItems(file: string, list: "attacks" | "checks", snippet: string): EditResult; // snippet: one mapping or a sequence of mappings
export function newScenarioFile(input: { id: string; title: string; taskBrief: string; policy: string; principal: string }): string;
```

(`useSavePack.ts`, client hook): `useSavePack(worldId, files)` → `{ files, save(next: Record<string,string>): Promise<ValidationError[]>, pending, errors }` — `POST /api/worlds/validate` then `PUT /api/worlds/:id`, `router.refresh()` on success.

- [ ] **Step 1: Tests**

```ts
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { appendListItems, newScenarioFile, removeListItem, setPolicyText, setTaskBrief } from "@/ui/worlds/scenarioEdits";
const FILE = `id: s\ntitle: T\n# keep me\ntask_brief: |\n  Old brief.\npolicy:\n  text: |\n    Old policy.\nchecks:\n  - { type: reads_scoped, dimension: data_access, principal: mem_001 }\nattacks: []\n`;
describe("scenarioEdits", () => {
  it("rewrites only the touched scalar and keeps comments", () => {
    const out = setTaskBrief(FILE, "New brief.\nSecond line.");
    expect(parse(out).task_brief).toBe("New brief.\nSecond line.\n");
    expect(out).toContain("# keep me");
    expect(parse(setPolicyText(FILE, "P2")).policy.text).toBe("P2\n");
  });
  it("removes one list item by index", () => {
    expect(parse(removeListItem(FILE, "checks", 0)).checks).toEqual([]);
    expect(parse(removeListItem(FILE, "checks", 5)).checks).toHaveLength(1);
  });
  it("appends a mapping or a sequence, and rejects anything else", () => {
    const one = appendListItems(FILE, "attacks", "id: a\ntitle: t\nmutation: { type: set_field, collection: c, id: r, field: f, value: x }\nlure: { tool: t, args_match: {} }");
    expect(one.ok && parse(one.file).attacks).toHaveLength(1);
    const two = appendListItems(FILE, "checks", "- { type: arg_lte, dimension: policy_compliance, tool: t, arg: a, max: 1 }\n- { type: arg_in, dimension: policy_compliance, tool: t, arg: a, values: [1] }");
    expect(two.ok && parse(two.file).checks).toHaveLength(3);
    expect(appendListItems(FILE, "checks", "just a string")).toEqual({ ok: false, error: "Paste one YAML mapping, or a list of them." });
    expect(appendListItems(FILE, "checks", "a: [").ok).toBe(false);
  });
  it("writes a new scenario file with one reads_scoped check", () => {
    const s = parse(newScenarioFile({ id: "x", title: "X", taskBrief: "Do it.", policy: "Only this.", principal: "mem_001" }));
    expect(s).toMatchObject({ id: "x", title: "X", task_brief: "Do it.\n", policy: { text: "Only this.\n" }, attacks: [] });
    expect(s.checks).toEqual([{ type: "reads_scoped", dimension: "data_access", principal: "mem_001" }]);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with `parseDocument`; block scalars: `const node = doc.createNode(value.endsWith("\n") ? value : value + "\n"); (node as Scalar).type = "BLOCK_LITERAL";`; `removeListItem` → `doc.deleteIn([list, index])` guarded by `doc.getIn([list, index]) !== undefined`; `appendListItems` → `parse(snippet)` in try/catch (error message from yaml → `{ ok:false, error }`); if plain object → one item, if array of plain objects → many, else the fixed error; `doc.addIn([list], doc.createNode(item))` (create the list when missing). `newScenarioFile` builds a `Document` from an object and sets block literals for the two texts.

- [ ] **Step 4: `ScenariosTab.tsx`** (client; props `{ worldId, files, scenarios: Scenario[], principal, runsByScenario: Record<string, number>, selected: string | null }`): port `renderWorldScenarios` 1634–1725 and `wireScenarioAuthoring`. State: `scNew`, `editing: { id, field } | null`, `adding: "attack" | "check" | null`, snippet text, `useSavePack`. List: header row (h2 "Scenarios in this World", `btn btn-primary` "+ New Scenario"), `p`, `.sc-card`s (h3, brief, `.meta` mini-tags id/`n Checks`/`n Attack(s)`/`n run(s)`, "Open & edit" `<Link href="?tab=scenarios&scenario={id}">`, "Remove" (`useSavePack.save` with the file key deleted) or the "Can't be removed" note). Detail: back link (`?tab=scenarios`), header (serif h2, id tag, runs tag), `.step-grid`: left — `editable("Task Brief")` and `editable("Mandate")` (mock 1618–1632: `.field-label` + `.linkish` edit → `.form-row` textarea + Save/Cancel; Save → `setTaskBrief`/`setPolicyText` then `save`), Attacks header + "+ add" `.linkish`, `.attack-card.selected` per attack (h3 id, p title, `.lure-tag` `⚡ Lure — {lureSummary}`, ✕ → `removeListItem`), the add box as `.panel.card-pad` with one `<textarea class="nw-ta">` (placeholder: the mock's example attack in YAML) + Add/Cancel; right — Checks header + "+ add", `.dim-group`s via `checksByDimension` (`.dim-head` label + count, `.check-row` `.ctype` + `checkParams` + ✕), add box textarea placeholder `- { type: arg_lte, dimension: policy_compliance, tool: …, arg: …, max: … }` with a hint listing the check types. Errors from `save` render as a `.nw-note` in the danger palette. New form (mock 1636–1644): id (`isValidScenarioId`), title, Task Brief, Mandate → `newScenarioFile` → `save`.

- [ ] **Step 5: `MandateTab.tsx`** (client; props `{ worldId, files, scenarios, principal }`): port `renderWorldMandate` 1781–1806: per scenario — header (h2 title, id tag), `editable("Mandate")` (same component as above, exported from `ScenariosTab.tsx` as `EditableText`), the explanatory `<p>`, `table.maptable` Dimension · Check · What it binds (`checkParams`), `.inject-box` per attack (text per spec §9.2), back-link-styled link "View the full Scenario — Task Brief, Attacks, every Check →" to `?tab=scenarios&scenario={id}`.

- [ ] **Step 6: Page**: parse `?scenario=`; `case "mandate"`/`"scenarios"` pass `pack.files`, `pack.scenarios`, `pack.meta.principal`, `runsByScenario` from `listRuns()`. **Step 7: Verify**: edit the Northwind Task Brief on a *copied* test pack (create one via `/worlds/new` copy first, or run against a temp packs dir), confirm the YAML on disk changed only that key; add a bad snippet and see the validation error; tests/tsc/eslint. **Step 8: Commit** — `feat(world): Scenarios and Mandate tabs with persisted text edits, add/remove Attacks and Checks`.

---

### Task 13: New world flow

**Files:**
- Create: `src/ui/worlds/newWorld/sources.ts`, `src/ui/worlds/newWorld/draftView.ts`, `src/ui/worlds/newWorld/NewWorld.tsx`, `src/lib/providers.ts`
- Modify: `src/app/worlds/new/page.tsx`
- Delete: `src/ui/worlds/NewWorld.tsx` (old)
- Test: `tests/ui/sources.test.ts`, `tests/ui/draftView.test.ts`, `tests/lib/providers.test.ts`

**Interfaces:**
- Produces (`sources.ts`):

```ts
export type ProviderInfo = { id: string; label: string; kind: string; hue: string; tools: { name: string; description: string }[] };
export type PackPick = { id: string; name: string; domain: string; description: string; entities: number; tools: number };
export type Source = { kind: "mcp"; provider: string } | { kind: "tools"; format: "mcp" | "openapi" | "ts"; text: string } | { kind: "db"; ddl: string } | { kind: "pack"; packId: string };
export const SRC_KIND: Record<Source["kind"] | "s3", string>; // mcp→"MCP", db→"database", s3→"object store", tools→"own tools", pack→"pack"
export function srcLabel(s: Source, providers: ProviderInfo[], packs: PackPick[]): string;
export function srcMode(s: Source): "shadowed" | "pasted" | "mocked" | "copied";
export function srcToolCount(s: Source, providers: ProviderInfo[], packs: PackPick[]): number | null;
export function isCopyOnly(sources: Source[]): string | null; // the packId when the only source is one pack
export function slugify(name: string): string; // "Zendesk desk" → "zendesk-desk", clipped to 41 chars, valid or ""
export type ReviewFields = { name: string; domain: string; principal: string; description: string };
export function toGenerateInput(sources: Source[], f: ReviewFields, providers: ProviderInfo[]): { name: string; domain: string; description: string; schema?: string; tools?: string; openapi?: string };
```

(`draftView.ts`): `draftEntities(files): { name: string; prefix: string; untrusted: string | null }[]`; `draftTools(files): { name: string; system: string; description: string }[]`; `draftScenario(files): { title: string; policy: string; checks: { dimension: string; type: string; params: string }[]; attack: { id: string; title: string; lure: string } | null } | null` — all via `yaml.parse` in try/catch, empty on failure.

(`providers.ts`, server): `listProviders(): ProviderInfo[]` reading `providersDir()` with `loadProviderTools`; labels/kinds/hues: stripe → Stripe / payments / `#7a4fa3`; zendesk → Zendesk / support / `#2f7d4f`; slack → Slack / chat / `#a83b6e`; okta → Okta / identity / `#3b6ea8`; google-workspace → Google Workspace / email / `#b3661a`; unknown id → Title-cased id / "MCP" / `#6E6B60`.

- [ ] **Step 1: Tests**

```ts
// tests/ui/sources.test.ts
import { describe, expect, it } from "vitest";
import { isCopyOnly, slugify, srcLabel, srcMode, srcToolCount, toGenerateInput, type PackPick, type ProviderInfo } from "@/ui/worlds/newWorld/sources";
const providers: ProviderInfo[] = [{ id: "stripe", label: "Stripe", kind: "payments", hue: "#7a4fa3", tools: [{ name: "create_refund", description: "Refund." }] }];
const packs: PackPick[] = [{ id: "p1", name: "Pack One", domain: "d", description: "x", entities: 3, tools: 4 }];
describe("sources", () => {
  it("labels, modes and counts every source kind", () => {
    expect(srcLabel({ kind: "mcp", provider: "stripe" }, providers, packs)).toBe("Stripe");
    expect(srcLabel({ kind: "tools", format: "openapi", text: "" }, providers, packs)).toBe("Your tools (OpenAPI)");
    expect(srcLabel({ kind: "db", ddl: "" }, providers, packs)).toBe("Pasted schema");
    expect(srcLabel({ kind: "pack", packId: "p1" }, providers, packs)).toBe("Pack One");
    expect(srcMode({ kind: "mcp", provider: "stripe" })).toBe("shadowed");
    expect(srcToolCount({ kind: "mcp", provider: "stripe" }, providers, packs)).toBe(1);
    expect(srcToolCount({ kind: "pack", packId: "p1" }, providers, packs)).toBe(4);
    expect(srcToolCount({ kind: "db", ddl: "" }, providers, packs)).toBeNull();
  });
  it("detects a copy-only composition and slugifies names", () => {
    expect(isCopyOnly([{ kind: "pack", packId: "p1" }])).toBe("p1");
    expect(isCopyOnly([{ kind: "pack", packId: "p1" }, { kind: "db", ddl: "x" }])).toBeNull();
    expect(slugify("Zendesk + orders-svc Desk")).toBe("zendesk-orders-svc-desk");
    expect(slugify("!!")).toBe("");
  });
  it("folds sources into the generator's input", () => {
    const out = toGenerateInput([{ kind: "mcp", provider: "stripe" }, { kind: "tools", format: "openapi", text: "paths: {}" }, { kind: "db", ddl: "create table x();" }],
      { name: "N", domain: "d", principal: "Customer", description: "Desc." }, providers);
    expect(out.name).toBe("N"); expect(out.schema).toBe("create table x();"); expect(out.openapi).toBe("paths: {}");
    expect(out.tools).toBe("- create_refund: Refund.");
    expect(out.description).toBe("Desc.\n\nPrincipal: Customer.\nSources: Stripe (shadowed over MCP); your own tools (OpenAPI); a pasted database schema.");
  });
});
```

```ts
// tests/ui/draftView.test.ts
import { describe, expect, it } from "vitest";
import { draftEntities, draftScenario, draftTools } from "@/ui/worlds/newWorld/draftView";
const files = {
  "pack.yaml": "entities:\n  members: { label: Member, id_prefix: mem_, owner: self, fields: { id: string } }\n  notes: { owner: { via: m }, fields: { id: string, body: { type: text, untrusted: true } } }\n",
  "tools.yaml": "get_member: { system: desk, kind: read, description: Fetch. }\n",
  "scenarios/a.yaml": "title: T\npolicy: { text: P }\nchecks:\n  - { type: arg_lte, dimension: policy_compliance, tool: t, arg: a, max: 1 }\nattacks:\n  - { id: x, title: XT, lure: { tool: t, args_match: { a: 1 } } }\n",
};
describe("draftView", () => {
  it("reads entities, tools and the first scenario out of draft files", () => {
    expect(draftEntities(files)).toEqual([{ name: "members", prefix: "mem_", untrusted: null }, { name: "notes", prefix: "—", untrusted: "body" }]);
    expect(draftTools(files)).toEqual([{ name: "get_member", system: "desk", description: "Fetch." }]);
    expect(draftScenario(files)).toEqual({ title: "T", policy: "P", checks: [{ dimension: "policy_compliance", type: "arg_lte", params: "tool: t · arg: a · max: 1" }], attack: { id: "x", title: "XT", lure: "t with a = 1" } });
    expect(draftEntities({ "pack.yaml": "a: [" })).toEqual([]);
    expect(draftScenario({})).toBeNull();
  });
});
```

```ts
// tests/lib/providers.test.ts
import { describe, expect, it } from "vitest";
import { listProviders } from "@/lib/providers";
describe("listProviders", () => {
  it("lists the shipped catalogs with labels and tool names", () => {
    const p = listProviders();
    expect(p.map((x) => x.id)).toEqual(["google-workspace", "okta", "slack", "stripe", "zendesk"]);
    expect(p.find((x) => x.id === "stripe")).toMatchObject({ label: "Stripe", kind: "payments" });
    expect(p.find((x) => x.id === "stripe")!.tools.map((t) => t.name)).toEqual(["list_payment_intents", "create_refund"]);
  });
});
```

- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** the three modules per the tests (`toGenerateInput` tools text = provider catalogs as `- name: description` lines joined `\n`, then the pasted `mcp`/`ts` tool text appended after a blank line; `openapi` format goes to `openapi`; `db` → `schema`; sources sentence pieces: mcp → `"{label} (shadowed over MCP)"`, tools → `"your own tools ({MCP tools/list | OpenAPI | TypeScript})"`, db → `"a pasted database schema"`, pack → `"a copy of {name}"`).

- [ ] **Step 4: `NewWorld.tsx`** (client; props `{ providers, packs: PackPick[], drafts: DraftSummary[], initialDraft: { id, files, errors } | null }`): port `renderNewWorld` 2001–2245 with these bindings. State `step 0|1|2`, `mode: "manual" | "plugin"`, `adding`, `sources: Source[]`, `draft: { id?: string; files; errors } | null`, `fields: ReviewFields`, `worldId` (defaults to `slugify(fields.name)`, editable), `generating`, `elapsed`, `error`. Header (back link, crumb, h1, sub — mock 2006–2008), `.nw-steps` chips (labels `How`, `mode === "plugin" ? "Generate" : "Compose"`, `Review`), `.panel.card-pad`:
  - step 0: two `.option`s (mock 2018–2026, the plugin option keeps its `roadmap-tag` "plugin" label).
  - step 1 manual: `.src-list` (`.src-item`: badge `SRC_KIND` coloured by index via `systemColor`, `.src-name` `srcLabel` + `.src-mode`, `.src-detail` `"{n} tools"` or `"pasted"`, ✕), `.empty-src` when empty, `.add-row` (`+ Third-party MCP`, `+ Your own tools`, `+ Database`, `+ Copy a pack`, and `+ Object storage` as `<button class="add-btn" disabled>` + `<span class="roadmap-tag">roadmap</span>`); add panels per mock 2073–2132 with the `vendor-grid` over `providers` (tile = first two letters, hue), the Shadow-mode `.nw-note`, the discovered `tooltable`; the paste `.seg` + `.nw-ta` (placeholder = mock `PASTE_SAMPLES[format]`); DDL `.nw-ta` (placeholder = mock `DB_SAMPLE`) + FK `.nw-note`; pack `.world-grid`; "Add to World" / Cancel.
  - step 1 plugin: h2 "Run the worldbuilder plugin", `p`, `.field-label` "1 · Install", two `.copyfield`s (`claude plugin marketplace add ./claude-plugin`, `claude plugin install agentsim-worldbuilder`) with `CopyButton`, "2 · Point it here": `.copyfield` `${origin}/mcp/worlds` (via `useOrigin`) and the README's `AGENTSIM_ALLOWED_HOSTS` sentence as `p`, `.chips` of `register_agent`, `get_world_draft`, `refine_world`, `create_world`, then `.field-label` "Drafts · one per run" and the `.draft-row`s (polling `GET /api/worlds/drafts` every 5 s while on this step; "Review →" loads `GET /api/worlds/drafts/{id}` into `draft` and goes to step 2). Continue is disabled here (the draft rows advance).
  - step 2: `.shadowbar`, `.step-grid` of Name / Domain / Principal / Description (`.form-row`s) + a disabled Surface field `"{tools} tools · {entities} entities across {n} sources"` (from `draftTools`/`draftEntities` when a draft exists, else from `srcToolCount`); `draft?.errors.length` → `.nw-note` danger listing them; with a draft: Entities `table.maptable` and Tools `table.tooltable`, "First Scenario, drafted" block (mock 2186–2198) from `draftScenario`; without a draft and `isCopyOnly` → tables from the picked `PackPick` counts only.
  - footer (mock 2203–2208): Back, Cancel (`/worlds`), primary: step 0 → "Continue →"; step 1 → "Review →" (disabled when manual and no sources); step 2 → `draft ? "Create World" : isCopyOnly ? "Create World" : "Generate with Claude"` — generate → `POST /api/worlds/generate` with `toGenerateInput(...)`, elapsed counter, on success `draft = { files, errors }` and `worldId = slugify(name)`; create → `POST /api/worlds { id: worldId, files: withPackId }` (copy path fetches `/api/worlds/{packId}` files first, as the old `NewWorld` did) → `router.push(/worlds/{id})`; API errors under the footer.

- [ ] **Step 5: Page** `src/app/worlds/new/page.tsx`: `providers = listProviders()`, `packs = loadPacks().packs.map(p => ({ id, name, domain, description, entities: Object.keys(p.meta.entities).length, tools: Object.keys(p.tools).length }))`, `drafts = listDrafts().map(summarizeDraft)`, `initialDraft = searchParams.draft ? getDraft(id) → { id, files, errors } : null`. Delete the old `src/ui/worlds/NewWorld.tsx`.

- [ ] **Step 6: Verify**: `/worlds/new` copy path creates a pack; compose Stripe + DDL shows "Generate with Claude" (with no API key the 503 message renders); `/worlds/new?draft=<id>` after creating a draft with `curl` against `/mcp/worlds` is optional — the drafts route test covers it. tests/tsc/eslint. **Step 7: Commit** — `feat(world): New world flow — compose from real sources, plugin drafts, review and create`.

---

### Task 14: Cleanup — remove the dropped surfaces

**Files:**
- Delete: `src/app/scenarios/`, `src/app/mandates/`, `src/app/connect/`, `src/app/dev/`, `src/ui/Header.tsx`, `Launcher.tsx`, `ConnectAgent.tsx`, `RecentRuns.tsx`, `RunHeader.tsx`, `RunView.tsx`, `RunPage.tsx` (old, root), `RunsListPage.tsx`, `Timeline.tsx`, `EventRow.tsx`, `CompareColumn.tsx`, `CompareRunColumn.tsx`, `PromptDiffSheet.tsx`, `lineDiff.ts`, `fixture.ts`, `ScorePanel.tsx` (root), `DiffPanel.tsx` (root), `ReplayScrubber.tsx`, `src/ui/flow/` (whole dir except `injected.ts`, which moves to `src/ui/run/injected.ts`), `src/ui/scenarios/`, `src/ui/connect/ConnectPage.tsx`, `AgentList.tsx`, `StartRun.tsx`, `ConnectionCard.tsx`, `src/ui/worlds/EntityMap.tsx`, `entityLayout.ts`, `ToolCards.tsx`, `ScenarioCards.tsx`, `AgentPrompts.tsx`, `PackCard.tsx`
- Delete tests: `tests/ui/entityLayout.test.ts`, `lineDiff.test.ts`, `buildFlow.test.ts` (after moving its two static guards into `tests/ui/waves.test.ts` with `EXEMPT = new Set()` and the "exempts exactly one file" case dropped), `entityBrowser.test.ts` (if `EntityBrowser.tsx` is deleted — it is, `EntitiesTab` replaces it), `connectStep.test.ts` (keep if `matchingAgents` survives in `ConnectStep.tsx` — it does; keep)
- Modify: `package.json` (remove `@xyflow/react`), `src/app/globals.css` (remove the xyflow import and `.react-flow__*` rules), `src/ui/styles.ts` (delete every export nothing imports — check with `grep -rn "from \"@/ui/styles\"\|from \"./styles\"\|from \"../styles\"" src`), `README.md` ("The three pages" table → Runs / Compare / New run / World, remove the Connect row and the `/connect` mentions; the connection snippets now live on the Run page)
- Run: `npm uninstall @xyflow/react`

- [ ] **Step 1:** Delete the files above; `npx tsc --noEmit` and fix every dangling import (expected: `src/ui/types.ts` is fine; `tests/ui/injected.test.ts` import path → `@/ui/run/injected`; `tests/ui/injectionSource.test.ts` unchanged). **Step 2:** Move the guards; `EXEMPT` empty. **Step 3:** `npm uninstall @xyflow/react`; remove CSS. **Step 4:** `npm test && npx tsc --noEmit && npx eslint && npm run build` → all green. **Step 5:** README edits. **Step 6: Commit** — `chore(console): remove the surfaces the redesign replaces and the xyflow dependency`.

---

### Task 15: Visual verification against the mock

- [ ] **Step 1:** With `npm run dev` running, use the Playwright MCP: open `design/agentsim-console.html` as `file://…` and each real route; at 1280×800 and 720×1100 take screenshots of: Runs, a run detail (golden `run_mtztrgl69wo`, flow and list, drawer open), Compare (`?a=run_mtztrgl69wo&b=run_mtztt48wkqq`), every wizard step, `/worlds`, each World tab on Northwind, `/worlds/new` on each step. Compare side by side; fix spacing/class mistakes until the only differences are data.
- [ ] **Step 2:** Keyboard pass: `[` collapses the sidebar; Tab reaches every row/card/button; Escape closes the drawer; ←/→ move between events.
- [ ] **Step 3:** `npm test && npx tsc --noEmit && npx eslint && npm run build`. **Step 4: Commit** — `fix(console): visual parity pass against the mock`.
- [ ] **Step 5:** Update the memory note `agentsim-hackathon-state.md` (redesign shipped on `sn/build/console-redesign`, 2026-09-17; decisions from §3 of the spec).

---

## Self-review notes

- Spec §5–§9 each map to Tasks 4, 6, 7, 8, 9–13; §10 to Tasks 3 and 9; §11 to Task 14; §12 to the tests in every task plus Task 15; §13 items appear nowhere as work (correct).
- Names used across tasks: `runName`, `scenarioShortTitle`, `relativeTime`, `runVerdict`, `verdictBadgeClass`, `toRunRow`, `groupWaves`, `eventFlags`, `isWriteTool`, `ownershipChain`, `erdLayout`, `entityViews`, `inputRows`, `outputLabel`, `guardRows`, `setTaskBrief`, `setPolicyText`, `removeListItem`, `appendListItems`, `newScenarioFile`, `useSavePack`, `srcLabel`, `srcMode`, `srcToolCount`, `isCopyOnly`, `slugify`, `toGenerateInput`, `draftEntities`, `draftTools`, `draftScenario`, `listProviders`, `listDrafts`, `summarizeDraft`, `sourceKindLabel`, `sourceDetail`, `activeNav` — each defined once, in the task that first needs it.
