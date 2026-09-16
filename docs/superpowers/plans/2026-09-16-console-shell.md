# Console Phase 1: Navigation Shell + Real Runs List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the top `Header` with a sidebar navigation shell, and turn "Recent runs" (a 12-row sidebar panel) into a real, full Runs list page at `/`.

**Architecture:** A new `Sidebar`/`ConsoleShell` pair of components provides the persistent chrome; `RunView` switches from rendering `Header` to rendering `ConsoleShell` + a new small `RunHeader` (the run-context strip, extracted verbatim from `Header`'s existing JSX). A new `RunsListPage` renders at `/`, fed by `listRuns()` extended to carry per-Dimension scores. Today's Launcher-only home page moves, unchanged, to a new `/runs/new` route. `Header.tsx` itself is untouched and keeps serving `/worlds`, `/connect`, `/compare` exactly as it does today.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript strict, Tailwind v4, vitest.

**Spec:** `docs/superpowers/specs/2026-09-16-console-shell-design.md`

## Global Constraints

- No change to how a Run is created, polled, scored, or evaluated — this plan is UI/routing only.
- `Header.tsx`, `Launcher.tsx`, `ConnectAgent.tsx`, `FlowView.tsx`, `Timeline.tsx`, `ScorePanel.tsx`,
  `DiffPanel.tsx`, `EventDrawer.tsx`, `PromptDiffSheet.tsx`, `useReplay.ts`, `useFlowState.ts` are
  not modified — Phase 1 reuses them exactly as they are today.
- `/worlds`, `/worlds/:id`, `/connect`, `/compare`, every `/api/*` and `/mcp/*` route: unchanged.
- Every new/changed file uses the existing tokens from `src/ui/styles.ts` (`panel`, `heading`,
  `mono`, `serif`, `dangerPill`, `focusRing`) — no new colors or fonts.
- After every task: `npm test`, `npx tsc --noEmit`, `npx eslint .` all clean.

---

### Task 1: Extend `RunSummary` with per-Dimension scores

**Files:**
- Modify: `src/runner/store.ts`
- Modify: `tests/runner/store.test.ts`

**Interfaces:**
- Produces: `RunSummary.dimensions: DimensionScore[]` (new field). `DimensionScore` is already
  exported from `src/engine/evaluator.ts:12` as `{ name: Dimension; score: number; passed: number;
  total: number }` — import it, don't redefine it. Later tasks (`RunsListPage`) read
  `summary.dimensions.find(d => d.name === "task_completion")?.score` etc.

- [ ] **Step 1: Write the failing test**

Add to `tests/runner/store.test.ts`, inside the existing `describe("store", ...)` block, right
after the `it("round-trips a v2 Run and lists newest first", ...)` test:

```typescript
  it("carries a Run's per-Dimension scores in its summary", () => {
    const dims = [
      { name: "task_completion" as const, score: 100, passed: 3, total: 3 },
      { name: "policy_compliance" as const, score: 0, passed: 0, total: 2 },
    ];
    const r = record({ status: "completed", finishedBy: "agent", score: { headline: 40, capped: true, capReason: "x", dimensions: dims } });
    expect(toSummary(r)).toMatchObject({ dimensions: dims });
  });

  it("gives a Run with no score yet an empty dimensions array, not undefined", () => {
    const r = record(); // status: "running", score: null
    expect(toSummary(r).dimensions).toEqual([]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/runner/store.test.ts`
Expected: FAIL — `toMatchObject` assertion fails because `toSummary(r)` has no `dimensions` key
yet (`undefined` does not match `dims`/`[]`).

- [ ] **Step 3: Implement**

In `src/runner/store.ts`, add the import and extend both the type and the function:

```typescript
import type { DiffEntry } from "@/engine/diff";
import type { DimensionScore, Score, Violation } from "@/engine/evaluator";
```

(This replaces the existing `import type { Score, Violation } from "@/engine/evaluator";` line —
just add `DimensionScore` to the same import.)

```typescript
export type RunSummary = Pick<RunRecord, "id" | "createdAt" | "status" | "packId" | "scenarioId"> & {
  agentLabel: string;
  agentKind: "reference" | "byo";
  attackId: string | null;
  headline: number | null;
  capped: boolean;
  golden: boolean;
  dimensions: DimensionScore[];
};
```

```typescript
export function toSummary(r: RunRecord, golden = false): RunSummary {
  return {
    id: r.id,
    createdAt: r.createdAt,
    status: r.status,
    packId: r.packId ?? "", // v1 records predate packs; Task 10 migrates them
    scenarioId: r.scenarioId,
    agentLabel: agentLabel(r.agent),
    agentKind: agentKind(r.agent),
    attackId: r.attack?.id ?? null,
    headline: r.score?.headline ?? null,
    capped: r.score?.capped ?? false,
    golden,
    dimensions: r.score?.dimensions ?? [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/runner/store.test.ts`
Expected: PASS, all tests in the file (the two new ones plus every existing one — this is an
additive field, no existing assertion reads or excludes it).

Run: `npm test`
Expected: full suite green — no other file destructures `RunSummary` exhaustively (an additive
field cannot break a consumer that doesn't read it).

- [ ] **Step 5: Commit**

```bash
git add src/runner/store.ts tests/runner/store.test.ts
git commit -m "feat(runner): carry per-Dimension scores on RunSummary"
```

---

### Task 2: `Sidebar` and `ConsoleShell`

**Files:**
- Create: `src/ui/Sidebar.tsx`
- Create: `src/ui/ConsoleShell.tsx`

**Interfaces:**
- Produces: `ConsoleShell({ children }: { children: React.ReactNode })` — the layout wrapper every
  Phase 1 page renders itself inside. `Sidebar` takes no props (reads its own active state from
  `usePathname()`, same pattern `Header.tsx` already uses).

This task has no automated test — it is pure layout with no logic beyond `usePathname()`-driven
active-state, the same shape `Header.tsx`'s existing `isCurrentSection` already has and already
has no dedicated test for. Verification is `tsc`/`eslint` plus the visual check in Task 5.

- [ ] **Step 1: Write `src/ui/Sidebar.tsx`**

```typescript
"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { heading, serif } from "./styles";

const NAV = [
  { href: "/", label: "Runs" },
  { href: "/worlds", label: "World" },
];

function isCurrentSection(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/runs");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex flex-col gap-5 p-3.5 bg-[#F1EEE4] border-r border-[#E3E0D5] h-screen sticky top-0">
      <div className="flex items-center gap-2 px-1.5">
        <div className="w-[22px] h-[22px] rounded-[6px] bg-[#1B1A17] flex items-center justify-center">
          <span className="w-2 h-2 rounded-sm bg-[#F7F5EF]" />
        </div>
        <b className={`${serif} text-[15px]`}>AgentSim</b>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map((n) => {
          const current = isCurrentSection(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B1A17] ${
                current ? "bg-[#1B1A17] text-white" : "text-[#6E6B60] hover:bg-black/[.04] hover:text-[#1B1A17]"
              }`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
      <div className="flex-1" />
      <div className={`${heading} px-2.5`}>AgentSim</div>
    </aside>
  );
}
```

(The Worlds/Connect nav items narrow to just `Runs`/`World` per the spec's explicit Phase 1
scope — `Connect` stays reachable at its existing URL without a sidebar entry, same as the spec's
"Confirmed facts" section states. The bottom status block is a plain wordmark repeat rather than
inventing status data that doesn't exist yet, per the spec's "shows nothing invented" rule.)

- [ ] **Step 2: Write `src/ui/ConsoleShell.tsx`**

```typescript
import { Sidebar } from "./Sidebar";

export function ConsoleShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[240px_1fr] min-h-screen bg-[#F7F5EF]">
      <Sidebar />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/ui/Sidebar.tsx src/ui/ConsoleShell.tsx`
Expected: clean. (Nothing imports these two files yet — that's Tasks 3-4 — so there is nothing to
render and look at until then.)

- [ ] **Step 4: Commit**

```bash
git add src/ui/Sidebar.tsx src/ui/ConsoleShell.tsx
git commit -m "feat(ui): add the Sidebar and ConsoleShell layout components"
```

---

### Task 3: `RunHeader`, and `RunView` moves from `Header` to `ConsoleShell`

**Files:**
- Create: `src/ui/RunHeader.tsx`
- Modify: `src/ui/RunView.tsx`

**Interfaces:**
- Consumes: `ConsoleShell` (Task 2, `src/ui/ConsoleShell.tsx`).
- Produces: `RunHeader({ run }: { run: RunRecord })` — a Run's context strip (pack pill, Scenario
  title, id, Agent pill, Attack pill). Not consumed by any later task in this plan; it exists so
  `RunView` doesn't inline the same JSX twice (it doesn't today, either — this is a straight
  extraction, not new behavior).

`Header.tsx` is **not modified or deleted** — `/worlds`, `/connect`, `/compare` still import and
render it exactly as today. This task only changes what `RunView.tsx` renders.

- [ ] **Step 1: Write `src/ui/RunHeader.tsx`**

This is `Header.tsx`'s existing `run ? (...) : ...` branch (lines 41-53 today), extracted verbatim
into its own component — same markup, same classes, same data, just no longer conditional on
`run` being non-null (the caller only renders it when there is one) and no longer sharing a
`<header>` element with the nav bar (there is no nav bar here — that's the Sidebar's job now):

```typescript
import { agentLabel } from "@/runner/agentRef";
import type { RunRecord } from "./types";
import { mono, serif } from "./styles";

export function RunHeader({ run }: { run: RunRecord }) {
  return (
    <div className="flex items-center gap-3 flex-wrap px-4 pt-4">
      <span className="text-xs border border-[#E3E0D5] rounded-full px-2 py-0.5">{run.packName}</span>
      <div className={`${serif} text-[20px] font-medium truncate max-w-[420px]`}>{run.scenarioTitle}</div>
      <span className={`${mono} text-xs text-[#6E6B60]`}>{run.id}</span>
      <div className="flex-1" />
      <span className="text-xs border border-[#E3E0D5] rounded-full px-2 py-0.5">Agent: {agentLabel(run.agent)}</span>
      <span className={`text-xs rounded-full px-2 py-0.5 border ${run.attack ? "border-[#1B1A17]" : "border-[#E3E0D5]"}`}>Attack: {run.attack ? "on" : "off"}</span>
    </div>
  );
}
```

- [ ] **Step 2: Rewrite `src/ui/RunView.tsx`'s imports and return statement**

Replace the `Header` import with `ConsoleShell` and `RunHeader`:

```
- import { Header } from "./Header";
+ import { ConsoleShell } from "./ConsoleShell";
+ import { RunHeader } from "./RunHeader";
```

Replace the return statement's outer structure — everything from `return (` to the closing `);`
of the component:

```
  return (
    <ConsoleShell>
      <div className="flex flex-col gap-4 p-4 h-screen">
        {displayRun && <RunHeader run={displayRun} />}
        <div className="grid grid-cols-[240px_1fr_400px] gap-4 flex-1 min-h-0">
          <aside className="flex flex-col gap-4">
            <Launcher packs={packs} run={displayRun} onPromptDiff={() => setDiffOpen(true)} />
            <ConnectAgent run={displayRun} />
            <RecentRuns runs={recent} currentId={displayRun?.id ?? null} />
          </aside>
          <main className={`${panel} flex flex-col overflow-hidden`}>
            {displayRun ? (
              <>
                <FlowToolbar state={flow} tools={tools} />
                {flow.view === "flow" ? (
                  <FlowView
                    run={displayRun}
                    visible={replay.visible}
                    selectedSeq={flow.selected}
                    onSelect={flow.select}
                    filters={flow.filters}
                    follow={flow.follow}
                    fitSignal={flow.fitSignal}
                    tools={tools}
                    injectedLabel={injectedLabel}
                  />
                ) : (
                  <Timeline run={displayRun} visible={replay.visible} tools={tools} injectedLabel={injectedLabel} />
                )}
                {displayRun.status !== "running" && <ReplayScrubber replay={replay} />}
              </>
            ) : (
              <div className="flex h-full items-center justify-center p-6">
                <p className={`${serif} text-center text-[28px] sm:text-[40px] font-medium leading-tight text-[#1B1A17] max-w-[20ch]`}>
                  Pick a Scenario and press Run.
                </p>
              </div>
            )}
          </main>
          <aside className="flex flex-col gap-4">
            <ScorePanel run={displayRun} replaying={replay.replaying} />
            <DiffPanel run={displayRun} principalLabel={principalLabel} />
          </aside>
        </div>
      </div>
      <PromptDiffSheet open={diffOpen} onClose={() => setDiffOpen(false)} run={displayRun} />
    </ConsoleShell>
  );
```

Every prop, every child component, every piece of state is identical to before — only the outer
wrapper (`<div className="min-h-screen text-sm"><Header run={displayRun} /><div className="grid
...">` → `<ConsoleShell><div className="flex flex-col ..."><RunHeader .../><div className="grid
...">`) and the run-context strip's location changed.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npx eslint src/ui/RunHeader.tsx src/ui/RunView.tsx`
Expected: clean.

Run: `npm test`
Expected: full suite green (no test renders `RunView`/`Header` directly — this codebase has no
jsdom/component-render tests, confirmed by the spec's "Phase 1 has no automated UI test" note in
Task 2 above; the real check is Task 5's live pass).

- [ ] **Step 4: Commit**

```bash
git add src/ui/RunHeader.tsx src/ui/RunView.tsx
git commit -m "feat(ui): RunView moves from Header to ConsoleShell + RunHeader"
```

---

### Task 4: `RunsListPage`, and the routing split

**Files:**
- Create: `src/ui/RunsListPage.tsx`
- Modify: `src/app/page.tsx`
- Create: `src/app/runs/new/page.tsx`

**Interfaces:**
- Consumes: `ConsoleShell` (Task 2), `RunSummary.dimensions` (Task 1).
- Produces: `RunsListPage({ runs, packs }: { runs: RunSummary[]; packs: PackOption[] })` — not
  consumed elsewhere in this plan.

- [ ] **Step 1: Write `src/ui/RunsListPage.tsx`**

```typescript
"use client";
import Link from "next/link";
import type { PackOption, RunSummary } from "./types";
import { dangerPill, heading, mono, panel, primaryButton, serif } from "./styles";

function dim(r: RunSummary, name: string): number | null {
  return r.dimensions.find((d) => d.name === name)?.score ?? null;
}

function packName(packs: PackOption[], packId: string): string {
  return packs.find((p) => p.id === packId)?.name ?? packId;
}

function scenarioTitle(packs: PackOption[], packId: string, scenarioId: string): string {
  return packs.find((p) => p.id === packId)?.scenarios.find((s) => s.id === scenarioId)?.title ?? scenarioId;
}

function Num({ value }: { value: number | null }) {
  if (value === null) return <span className={`${mono} text-[#6E6B60]`}>—</span>;
  return <span className={`${mono} ${value < 100 ? "text-[#B23A22] font-bold" : ""}`}>{value}</span>;
}

/**
 * The two most-recent completed Runs of the same Scenario by different Agents, picked by
 * whichever pair's later Run is newest overall — the mockup's "Compare" card, minus any new
 * comparison logic (Phase 5's job). `null` when no such pair exists; the card is then omitted,
 * not shown disabled — a card that looks clickable but isn't is exactly the defect already
 * fixed once in the mockup's own review.
 */
function latestComparablePair(runs: RunSummary[]): { a: RunSummary; b: RunSummary } | null {
  const byScenario = new Map<string, RunSummary[]>();
  for (const r of runs) {
    if (r.status !== "completed") continue;
    const list = byScenario.get(r.scenarioId) ?? [];
    list.push(r);
    byScenario.set(r.scenarioId, list);
  }
  let best: { a: RunSummary; b: RunSummary } | null = null;
  let bestTime = -Infinity;
  for (const list of byScenario.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].agentLabel === list[j].agentLabel) continue;
        const t = Math.max(new Date(list[i].createdAt).getTime(), new Date(list[j].createdAt).getTime());
        if (t > bestTime) {
          bestTime = t;
          best = { a: list[i], b: list[j] };
        }
      }
    }
  }
  return best;
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className={`${panel} p-4 flex flex-col gap-1 flex-1 min-w-[200px]`}>
      <div className={heading}>{label}</div>
      <div className={`${serif} text-[26px] font-medium leading-none`}>{value}</div>
      <div className="text-[12px] text-[#6E6B60]">{detail}</div>
    </div>
  );
}

export function RunsListPage({ runs, packs }: { runs: RunSummary[]; packs: PackOption[] }) {
  const failed = runs.filter((r) => r.capped).length;
  const running = runs.filter((r) => r.status === "running").length;
  const attacked = runs.filter((r) => r.attackId !== null);
  const attackSucceeded = attacked.filter((r) => r.capped).length;
  const pair = latestComparablePair(runs);

  return (
    <div className="p-8 flex flex-col gap-5">
      <div>
        <div className={heading}>AgentSim</div>
        <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Runs</h1>
        <p className="text-[13px] text-[#6E6B60] mt-1">
          {runs.length} run{runs.length === 1 ? "" : "s"}
          {failed > 0 ? `. ${failed} failed its Mandate.` : "."}
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <InsightCard label="Runs" value={String(runs.length)} detail={running > 0 ? `${running} running, ${failed} capped` : `${failed} capped`} />
        <InsightCard
          label="Under attack"
          value={String(attacked.length)}
          detail={attacked.length > 0 ? `${attackSucceeded} of ${attacked.length} broke the Mandate` : "no attacked runs yet"}
        />
        {pair && (
          <Link href={`/compare?a=${pair.a.id}&b=${pair.b.id}`} className={`${panel} p-4 flex flex-col gap-1 flex-1 min-w-[200px] hover:bg-black/[.02]`}>
            <div className={heading}>Compare</div>
            <div className={`${serif} text-[18px] font-medium leading-tight truncate`}>{scenarioTitle(packs, pair.a.packId, pair.a.scenarioId)}</div>
            <div className="text-[12px] text-[#6E6B60]">{pair.a.agentLabel} vs {pair.b.agentLabel} →</div>
          </Link>
        )}
      </div>

      <div className="flex justify-end">
        <Link href="/runs/new" className={primaryButton}>+ New run</Link>
      </div>

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr>
              {["Run", "Scenario", "Attack", "Agent", "Task", "Mandate", "Safety", "World", "Verdict", "When"].map((h) => (
                <th key={h} className={`${heading} text-left px-3.5 py-3 border-b border-[#E3E0D5]`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} className="hover:bg-black/[.02]">
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]">
                  <Link href={`/runs/${r.id}`} className="block">
                    <div className="font-semibold text-[13px]">{scenarioTitle(packs, r.packId, r.scenarioId)}</div>
                    <div className={`${mono} text-[11px] text-[#6E6B60]`}>{r.id}</div>
                  </Link>
                </td>
                <td className={`${mono} text-[12px] px-3.5 py-3 border-b border-[#E3E0D5]`}>{r.scenarioId}</td>
                <td className={`${mono} text-[12px] text-[#6E6B60] px-3.5 py-3 border-b border-[#E3E0D5]`}>{r.attackId ?? "—"}</td>
                <td className="text-[13px] px-3.5 py-3 border-b border-[#E3E0D5]">{r.agentLabel}</td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "task_completion")} /></td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "policy_compliance")} /></td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "safety")} /></td>
                <td className="text-[13px] px-3.5 py-3 border-b border-[#E3E0D5]">{packName(packs, r.packId)}</td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]">
                  {r.status === "running" ? (
                    <span className="text-[11px] text-[#6E6B60]">running…</span>
                  ) : r.capped ? (
                    <span className={`px-2 py-0.5 text-[11px] font-bold uppercase ${dangerPill}`}>Capped</span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded-full bg-[#E7F4EA] text-[#1E7A43]">Pass</span>
                  )}
                </td>
                <td className="text-[12px] text-[#6E6B60] px-3.5 py-3 border-b border-[#E3E0D5]">{new Date(r.createdAt).toLocaleString()}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={10} className="px-3.5 py-8 text-center text-[13px] text-[#6E6B60]">No runs yet — start one to see it here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

(The Compare card's own comparison *view* — a real per-event ledger diff — is Phase 5's job, not
this task's; this task only computes which two Runs to link together and reuses the existing
`/compare` route as-is, so it never links to logic that doesn't exist. `Task`/`Mandate`/`Safety`
column headers name the three Dimensions the mockup showed; a Run with no score yet (`status:
"running"`) renders `—` via `Num`'s null case, not a crash.)

- [ ] **Step 2: Rewrite `src/app/page.tsx`**

```typescript
import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { RunsListPage } from "@/ui/RunsListPage";

export const dynamic = "force-dynamic";

const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

export default function Home() {
  return (
    <ConsoleShell>
      <RunsListPage runs={listRuns()} packs={packs()} />
    </ConsoleShell>
  );
}
```

- [ ] **Step 3: Create `src/app/runs/new/page.tsx`**

This is `src/app/page.tsx`'s exact previous content, unmodified — the Launcher-only experience,
now at its own route instead of `/`:

```typescript
import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

/** `loadPacks` skips a pack that no longer loads, so one bad pack cannot 500 the front door. */
const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

export default function NewRun() {
  return <RunPage id={null} initialRun={null} packs={packs()} tools={{}} principalLabel="" injectedLabel="" recent={listRuns()} />;
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npx eslint src/ui/RunsListPage.tsx src/app/page.tsx src/app/runs/new/page.tsx`
Expected: clean.

Run: `npm test`
Expected: full suite green.

Run: `npm run build`
Expected: succeeds; `/`, `/runs/new`, `/runs/[id]` all register as routes (`/` and `/runs/new` are
new/changed routes — confirm both appear in the build output's route list).

- [ ] **Step 5: Commit**

```bash
git add src/ui/RunsListPage.tsx src/app/page.tsx src/app/runs/new/page.tsx
git commit -m "feat(ui): a real Runs list at /, the old home moves to /runs/new"
```

---

### Task 5: Visual verification

**Files:** none — this task runs and looks, it does not write code.

**Interfaces:** none.

- [ ] **Step 1: Full regression baseline**

Run: `npm test`, `npx tsc --noEmit`, `npx eslint .`, `npm run build` — all clean.

- [ ] **Step 2: Look at it, in a real browser**

Start `npm run dev`. Using Playwright or equivalent:

1. Navigate to `/`. Confirm: the sidebar renders on the left (wordmark, Runs/World nav, Runs
   highlighted as active), the Runs table renders with real data from `data/golden/` and `data/
   runs/` (every existing golden Run should appear), Task/Mandate/Safety columns show real numbers
   (not all `—` — if they are, `dimensions` isn't flowing through and Task 1 needs a second look),
   a Capped run shows the red pill, a passing run shows the green one. Confirm the "Runs" and
   "Under attack" insight cards show real, non-zero-looking-fake numbers, and — if any two golden
   Runs share a Scenario with different Agents (Northwind's naive vs. fixed-agent pair should
   qualify) — a "Compare" card appears and clicking it lands on `/compare?a=...&b=...` with both
   Runs' Flows rendered side-by-side.
2. Click "+ New run". Confirm you land on `/runs/new` and see exactly today's Launcher-only
   experience (the Launcher rail, the empty Flow canvas with "Pick a Scenario and press Run.").
   Confirm the sidebar is present here too and "Runs" still reads as the active nav item (the
   route starts with `/runs`).
3. Click a Run row on `/`. Confirm you land on `/runs/:id` with the sidebar present, the
   `RunHeader` strip showing the pack/Scenario/id/Agent/Attack pills where the old top Header used
   to show them, and the Flow canvas, Score panel, Diff panel, and Timeline toggle all working
   exactly as before — click a node, confirm the `EventDrawer` still opens; toggle Flow/List;
   confirm the Replay scrubber still works on a completed Run.
4. Navigate to `/worlds` and `/connect` directly. Confirm both still render with the **old** top
   `Header` (unchanged, per this plan's global constraint) — this is the expected, correct state
   for Phase 1, not a bug to fix.

- [ ] **Step 3: Report**

State plainly: full-suite pass count, build success, and for each of the four checks above, what
you saw — including anything that reads wrong even if every automated check passed. An
automated-clean, visually-broken result is not a passing Task 5.
