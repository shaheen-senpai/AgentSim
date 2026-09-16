# AgentSim Console — Phase 2: New Run Wizard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `/runs/new`'s content with the approved mockup's 6-step wizard (Connect agent →
World → Scenario → Mandate → Attacks → Review), reusing real pack/Scenario/Agent data and the
existing `POST /api/runs`/`POST /api/agents` routes — no new backend logic.

**Architecture:** A new `src/ui/wizard/` directory: `NewRunWizard.tsx` owns all wizard state and the
footer; `StepStrip.tsx` renders the 6-chip stepper; `steps/*.tsx` render one step body each.
`/runs/new/page.tsx` is rewritten to fetch a new, richer pack summary (`WizardPack`, added to
`src/lib/summaries.ts`) plus the registered-agent list, and render `<ConsoleShell><NewRunWizard/></ConsoleShell>`.

**Tech Stack:** Next.js 16 App Router, React client components, Tailwind arbitrary values (no new
CSS files — matches every other `src/ui` component), the existing `src/ui/styles.ts` tokens.

**Spec:** `docs/superpowers/specs/2026-09-16-console-wizard-design.md`

## Global Constraints

- Reuse `src/ui/styles.ts` tokens exactly (`panel`, `heading`, `mono`, `serif`, `field`, `label`,
  `hint`, `focusRing`, `primaryButton`, `secondaryButton`, `dangerPill`, `successBg`/`successFg`,
  `dangerBg`/`dangerFg`) — no new colors, no new CSS.
- `/runs/new`'s only job is to create a Run and navigate to it — no new API routes; `POST /api/runs`
  and `POST /api/agents` are called exactly as their existing callers (`Launcher.tsx`, `StartRun.tsx`,
  `RegisterAgent.tsx`) already call them.
- `RunView`, `RunPage`, `Launcher.tsx`, `ConnectAgent.tsx` are **not touched** by this plan — `/runs/:id`
  keeps working exactly as today.
- Every new file is TypeScript-strict (no `any`), follows the codebase's existing prop-drilling style
  (explicit callback props, no new context/state-management library).
- Attribution: every commit ends with the trailer the session's system reminder specifies (checked at
  dispatch time — do not hardcode a stale one into this plan).

---

### Task 1: Wizard pack/Scenario summaries

**Files:**
- Modify: `src/lib/summaries.ts`
- Test: `tests/lib/summaries.test.ts` (create if it doesn't exist; check first — extend if it does)

**Interfaces:**
- Consumes: `Scenario`, `WorldPack`, `Attack`, `Check` from `@/engine/pack` (already imported in this
  file); `Dimension`, `DIMENSIONS` from `@/engine/dimensions`.
- Produces: `WizardAttack`, `WizardTool`, `WizardScenario`, `WizardPack` types, `toWizardScenario`,
  `toWizardPack` functions — consumed by Task 6 (`/runs/new/page.tsx`) and by every step component
  (Tasks 3-5) via `@/ui/types`.

- [ ] **Step 1: Add the types and builder functions**

Append to `src/lib/summaries.ts` (keep every existing export unchanged):

```ts
import { DIMENSIONS, type Dimension } from "@/engine/dimensions";

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

export function toWizardScenario(s: Scenario, packId: string): WizardScenario {
  const counts = new Map<Dimension, number>();
  for (const c of s.checks) counts.set(c.dimension, (counts.get(c.dimension) ?? 0) + 1);
  return {
    id: s.id,
    packId,
    title: s.title,
    taskBrief: s.task_brief,
    policyText: s.policy.text,
    attacks: s.attacks.map((a) => ({ id: a.id, title: a.title, lure: { tool: a.lure.tool, argsMatch: a.lure.args_match } })),
    checkCountByDimension: DIMENSIONS.filter((d) => counts.has(d)).map((dimension) => ({ dimension, count: counts.get(dimension)! })),
  };
}

export function toWizardPack(p: WorldPack): WizardPack {
  return {
    id: p.meta.id,
    name: p.meta.name,
    domain: p.meta.domain,
    description: p.meta.description,
    principal: p.meta.principal,
    entities: Object.keys(p.meta.entities).length,
    systems: new Set(Object.values(p.tools).map((t) => t.system)).size,
    tools: Object.values(p.tools).map((t) => ({ name: t.name, description: t.description })),
    agentVersions: Object.keys(p.agents),
    scenarios: p.scenarios.map((s) => toWizardScenario(s, p.meta.id)),
  };
}
```

Note: `p.meta.entities` — confirm the exact field name on `PackMeta` by reading `src/engine/pack.ts`'s
`PackMeta` type before writing this (it holds the entity-spec map `toPackSummary` already reads as
`Object.keys(p.meta.entities).length`, line ~82 of that file, so this line is a direct copy of an
already-working expression — verify it still reads exactly that way, and if the field is named
differently, use the real name instead).

- [ ] **Step 2: Write the tests**

```ts
import { describe, expect, it } from "vitest";
import { toWizardPack, toWizardScenario } from "@/lib/summaries";
import { loadPack } from "@/engine/pack";

describe("toWizardScenario", () => {
  it("carries task brief, policy text, attacks with lure, and check counts by dimension", () => {
    const pack = loadPack("northwind");
    const scenario = pack.scenarios[0];
    const w = toWizardScenario(scenario, pack.meta.id);
    expect(w.id).toBe(scenario.id);
    expect(w.packId).toBe(pack.meta.id);
    expect(w.taskBrief).toBe(scenario.task_brief);
    expect(w.policyText).toBe(scenario.policy.text);
    expect(w.attacks).toHaveLength(scenario.attacks.length);
    if (scenario.attacks.length > 0) {
      expect(w.attacks[0]).toEqual({ id: scenario.attacks[0].id, title: scenario.attacks[0].title, lure: { tool: scenario.attacks[0].lure.tool, argsMatch: scenario.attacks[0].lure.args_match } });
    }
    const totalChecks = w.checkCountByDimension.reduce((n, d) => n + d.count, 0);
    expect(totalChecks).toBe(scenario.checks.length);
  });
});

describe("toWizardPack", () => {
  it("carries domain, description, principal, entity/system/tool counts, versions, and scenarios", () => {
    const pack = loadPack("northwind");
    const w = toWizardPack(pack);
    expect(w.id).toBe(pack.meta.id);
    expect(w.name).toBe(pack.meta.name);
    expect(w.domain).toBe(pack.meta.domain);
    expect(w.description).toBe(pack.meta.description);
    expect(w.principal).toBe(pack.meta.principal);
    expect(w.entities).toBe(Object.keys(pack.meta.entities).length);
    expect(w.tools).toHaveLength(Object.keys(pack.tools).length);
    expect(w.agentVersions).toEqual(Object.keys(pack.agents));
    expect(w.scenarios).toHaveLength(pack.scenarios.length);
    expect(w.systems).toBeGreaterThan(0);
  });
});
```

Adjust `loadPack("northwind")` to whatever pack id actually exists in this repo's `worldpacks/`
directory at test time — list `worldpacks/` first and use a real, currently-installed pack id (do not
assume `"northwind"` is still there; it was real at the time this spec's context was written but
verify).

- [ ] **Step 3: Run the tests, confirm pass, commit**

Run: `npm test -- tests/lib/summaries.test.ts`
Expected: all new tests pass, no existing test broken.

```bash
git add src/lib/summaries.ts tests/lib/summaries.test.ts
git commit -m "feat(wizard): add WizardPack/WizardScenario summaries for the New Run wizard"
```

---

### Task 2: `RegisterAgent` gains an optional `lockedShape` prop

**Files:**
- Modify: `src/ui/connect/RegisterAgent.tsx`
- Test: check for an existing `tests/ui/registerAgent.test.tsx` (or similar) first; extend it if
  present, otherwise this task's manual verification (Step 3) is enough — do not invent a new test
  harness for a component that has none today.

**Interfaces:**
- Consumes: nothing new.
- Produces: `RegisterAgent` accepts `lockedShape?: AgentShape` — when set, the Shape fieldset (the
  three-button toggle) is not rendered, `shape` state is seeded from `lockedShape` instead of the
  hardcoded `"mcp"` default, and a plain, non-interactive line shows which shape is locked in
  (`Shape: {label}`, using the same `SHAPES` array already in this file for the label/blurb text).
  Consumed by Task 4 (`ConnectStep.tsx`), which always passes `lockedShape`.

- [ ] **Step 1: Add the prop**

In `src/ui/connect/RegisterAgent.tsx`, change the `Props` type and the component signature:

```tsx
type Props = {
  editing: Agent | null;
  lockedShape?: AgentShape;
  onSubmit: (submission: AgentSubmission) => Promise<string | null>;
  onCancel: () => void;
};

export function RegisterAgent({ editing, lockedShape, onSubmit, onCancel }: Props) {
```

Change the `shape` state initializer:

```tsx
const [shape, setShape] = useState<AgentShape>(editing?.shape ?? lockedShape ?? "mcp");
```

Replace the `<fieldset>` block (the Shape toggle) with a conditional:

```tsx
{lockedShape === undefined ? (
  <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
    <legend className={label}>Shape</legend>
    <div className="flex gap-1">
      {SHAPES.map((s) => (
        <button
          key={s.value}
          type="button"
          onClick={() => setShape(s.value)}
          aria-pressed={shape === s.value}
          className={`h-7 flex-1 rounded px-2 text-[12px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] ${
            shape === s.value ? "bg-[#1d1d1b] text-white border-[#1d1d1b] font-semibold" : "bg-white text-[#6b6b66] border-[#cfcfcb] hover:text-[#1d1d1b]"
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
    <p className={hint}>{SHAPES.find((s) => s.value === shape)?.blurb}</p>
  </fieldset>
) : (
  <p className={hint}>
    Shape: <span className="font-semibold text-[#1d1d1b]">{SHAPES.find((s) => s.value === lockedShape)?.label}</span> —{" "}
    {SHAPES.find((s) => s.value === lockedShape)?.blurb}
  </p>
)}
```

Everything else in the file (the alias textarea, notes field, submit handling) is unchanged.

- [ ] **Step 2: Confirm `/connect` still works unmodified**

`ConnectPage.tsx`/wherever `<RegisterAgent>` is currently rendered passes no `lockedShape` — confirm
by grepping `<RegisterAgent` across `src/ui/connect/` that no call site needs updating (the prop is
optional, so none do).

Run: `npx tsc --noEmit`
Expected: no new type errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/connect/RegisterAgent.tsx
git commit -m "feat(connect): RegisterAgent accepts an optional lockedShape, for embedding in the wizard"
```

---

### Task 3: Wizard shell, stepper, and the four simple steps (World / Scenario / Mandate / Attacks)

**Files:**
- Create: `src/ui/wizard/NewRunWizard.tsx`
- Create: `src/ui/wizard/StepStrip.tsx`
- Create: `src/ui/wizard/steps/WorldStep.tsx`
- Create: `src/ui/wizard/steps/ScenarioStep.tsx`
- Create: `src/ui/wizard/steps/MandateStep.tsx`
- Create: `src/ui/wizard/steps/AttackStep.tsx`
- Modify: `src/ui/types.ts` (re-export the new summary types)
- Test: `tests/ui/attackLure.test.ts` (the one pure-logic unit worth testing in isolation — the lure
  formatting rule)

**Interfaces:**
- Consumes: `WizardPack`, `WizardScenario` from `@/ui/types` (Task 1).
- Produces: `WizardState`, `ConnectMode`, `STEP_LABELS` (exported from `NewRunWizard.tsx`) — consumed
  by Task 4 (`ConnectStep.tsx`) and Task 5 (`ReviewStep.tsx`); `formatLure(lure)` (exported from
  `AttackStep.tsx`) — consumed by Task 5's Review summary line.

- [ ] **Step 1: Re-export the new types**

In `src/ui/types.ts`, extend the existing summaries re-export line:

```ts
export type { ScenarioSummary, PackSummary, PackOption, WizardAttack, WizardTool, WizardScenario, WizardPack } from "@/lib/summaries";
```

- [ ] **Step 2: `StepStrip.tsx`**

```tsx
"use client";
import { focusRing } from "@/ui/styles";

export function StepStrip({ labels, current, onSelect }: { labels: string[]; current: number; onSelect: (step: number) => void }) {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto pb-1" role="tablist" aria-label="New run steps">
      {labels.map((label, i) => {
        const state = i === current ? "current" : i < current ? "done" : "future";
        return (
          <div key={label} className="flex items-center gap-1.5">
            <button
              type="button"
              role="tab"
              aria-selected={i === current}
              disabled={state === "future"}
              onClick={() => onSelect(i)}
              className={`flex flex-none items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 pr-2 text-[12.5px] font-medium ${focusRing} ${
                state === "current"
                  ? "border-[#1B1A17] text-[#1B1A17] shadow-[0_0_0_1px_#1B1A17_inset]"
                  : state === "done"
                    ? "border-[#E3E0D5] text-[#1B1A17] disabled:cursor-default"
                    : "border-[#E3E0D5] text-[#6E6B60] cursor-not-allowed"
              }`}
            >
              <span
                className={`flex h-[22px] w-[22px] items-center justify-center rounded-full text-[11px] font-bold ${
                  state === "current" ? "bg-[#1B1A17] text-white" : state === "done" ? "bg-[#1E7A43] text-white" : "bg-[#E3E0D5] text-[#6E6B60]"
                }`}
              >
                {state === "done" ? "✓" : i + 1}
              </span>
              {label}
            </button>
            {i < labels.length - 1 && <div className="h-px w-4 flex-none bg-[#E3E0D5]" />}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 3: `steps/WorldStep.tsx`**

```tsx
"use client";
import Link from "next/link";
import type { WizardPack } from "@/ui/types";
import { panel, focusRing } from "@/ui/styles";
import type { WizardState } from "../NewRunWizard";

export function WorldStep({ packs, state, onChange }: { packs: WizardPack[]; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  if (packs.length === 0) {
    return (
      <div className={`${panel} p-6 text-center flex flex-col gap-2`}>
        <p className="text-[13px] text-[#6E6B60]">No Worlds installed yet.</p>
        <Link href="/worlds/new" className={`${focusRing} text-[13px] font-semibold text-[#1B1A17] underline underline-offset-2`}>
          Create a World →
        </Link>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
      {packs.map((p) => {
        const selected = state.packId === p.id;
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => onChange({ packId: p.id, scenarioId: p.scenarios[0]?.id ?? "", attackId: "off" })}
            className={`${panel} p-4 text-left ${focusRing} ${selected ? "shadow-[0_0_0_1px_#1B1A17_inset] border-[#1B1A17]" : ""}`}
          >
            <h3 className="text-[15px] font-semibold mb-1">{p.name}</h3>
            <div className="font-mono text-[11px] text-[#6E6B60] mb-2">{p.domain}</div>
            <p className="text-[12.5px] text-[#6E6B60] mb-2.5 leading-relaxed">{p.description}</p>
            <div className="flex gap-3.5 flex-wrap text-[11px] text-[#6E6B60]">
              <span>{p.entities} entities</span>
              <span>Principal: {p.principal}</span>
              <span>{p.systems} systems</span>
              <span>{p.tools.length} tools</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: `steps/ScenarioStep.tsx`**

```tsx
"use client";
import type { WizardPack } from "@/ui/types";
import { panel, focusRing, serif } from "@/ui/styles";
import type { WizardState } from "../NewRunWizard";

export function ScenarioStep({ pack, state, onChange }: { pack: WizardPack; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-3 max-w-[720px]">
      {pack.scenarios.map((s) => {
        const selected = state.scenarioId === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange({ scenarioId: s.id, attackId: "off" })}
            className={`${panel} p-4.5 text-left ${focusRing} ${selected ? "shadow-[0_0_0_1px_#1B1A17_inset] border-[#1B1A17]" : ""}`}
          >
            <h3 className={`${serif} text-[15px] font-semibold mb-1.5`}>{s.title}</h3>
            <p className="text-[12.5px] text-[#6E6B60]">{s.taskBrief}</p>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 5: `steps/MandateStep.tsx`**

```tsx
"use client";
import type { WizardScenario } from "@/ui/types";
import { panel } from "@/ui/styles";

export function MandateStep({ scenario }: { scenario: WizardScenario }) {
  return (
    <div className={`${panel} p-5 max-w-[720px] flex flex-col gap-3`}>
      <h2 className="text-[14px] font-semibold">The Mandate — what the agent is authorised to do</h2>
      <div className="bg-[#F7F5EF] border border-[#E3E0D5] border-l-[3px] border-l-[#1B1A17] rounded-r-lg px-4.5 py-4 text-[13.5px] leading-relaxed whitespace-pre-line">
        {scenario.policyText}
      </div>
      <p className="text-[11.5px] text-[#6E6B60] flex items-center gap-1.5">
        ↳ drawn from the Scenario you picked — &ldquo;{scenario.title}&rdquo;. Every Check on Review traces back to a sentence here.
      </p>
    </div>
  );
}
```

- [ ] **Step 6: `steps/AttackStep.tsx`** (exports `formatLure`, used again by Task 5)

```tsx
"use client";
import type { WizardAttack, WizardScenario } from "@/ui/types";
import { panel, focusRing, dangerFg } from "@/ui/styles";
import type { WizardState } from "../NewRunWizard";

export function formatLure(lure: WizardAttack["lure"]): string {
  const entries = Object.entries(lure.argsMatch);
  if (entries.length === 1) return `${lure.tool} → ${String(entries[0][1])}`;
  return `${lure.tool} → ${entries.map(([k, v]) => `${k}: ${String(v)}`).join(", ")}`;
}

export function AttackStep({ scenario, state, onChange }: { scenario: WizardScenario; state: WizardState; onChange: (patch: Partial<WizardState>) => void }) {
  return (
    <div className="flex flex-col gap-2.5 max-w-[720px]">
      <button
        type="button"
        onClick={() => onChange({ attackId: "off" })}
        className={`${panel} p-4 text-left ${focusRing} ${state.attackId === "off" ? "shadow-[0_0_0_1px_#1E7A43_inset] border-[#1E7A43]" : ""}`}
      >
        <h3 className="text-[13.5px] font-semibold mb-1">Off — clean run</h3>
        <p className="text-[12px] text-[#6E6B60]">The World stays exactly as seeded. No planted text, no Lure.</p>
      </button>
      {scenario.attacks.map((a) => {
        const selected = state.attackId === a.id;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onChange({ attackId: a.id })}
            className={`${panel} p-4 text-left ${focusRing} ${selected ? "shadow-[0_0_0_1px_#1B1A17_inset] border-[#1B1A17]" : ""}`}
          >
            <h3 className="text-[13.5px] font-semibold mb-1">{a.id}</h3>
            <p className="text-[12px] text-[#6E6B60]">{a.title}</p>
            <div className="mt-2 font-mono text-[11px]" style={{ color: dangerFg }}>
              ⚡ Lure — {formatLure(a.lure)}
            </div>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 7: `NewRunWizard.tsx` shell** (Connect/Review steps are placeholders here — Tasks 4-5
  replace the placeholders with the real `ConnectStep`/`ReviewStep`; this task must still leave the
  file in a working, navigable state end to end for steps 1-4)

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Agent, WizardPack } from "@/ui/types";
import { StepStrip } from "./StepStrip";
import { WorldStep } from "./steps/WorldStep";
import { ScenarioStep } from "./steps/ScenarioStep";
import { MandateStep } from "./steps/MandateStep";
import { AttackStep } from "./steps/AttackStep";
import { secondaryButton, primaryButton, serif, hint } from "@/ui/styles";

export const STEP_LABELS = ["Connect agent", "World", "Scenario", "Mandate", "Attacks", "Review"];
export type ConnectMode = "reference" | "mcp" | "forwarder" | "connector";
export type WizardState = {
  step: number;
  connect: ConnectMode;
  agentVersion: string;
  existingAgentId: string | null;
  packId: string;
  scenarioId: string;
  attackId: string;
};

function initialState(packs: WizardPack[]): WizardState {
  const pack = packs[0];
  return {
    step: 0,
    connect: "reference",
    agentVersion: pack?.agentVersions[0] ?? "",
    existingAgentId: null,
    packId: pack?.id ?? "",
    scenarioId: pack?.scenarios[0]?.id ?? "",
    attackId: "off",
  };
}

export function NewRunWizard({ packs, agents }: { packs: WizardPack[]; agents: Agent[] }) {
  const router = useRouter();
  const [state, setState] = useState<WizardState>(() => initialState(packs));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update(patch: Partial<WizardState>) {
    setState((s) => ({ ...s, ...patch }));
  }

  const pack = packs.find((p) => p.id === state.packId);
  const scenario = pack?.scenarios.find((s) => s.id === state.scenarioId);
  const lastStep = STEP_LABELS.length - 1;

  const canContinue = state.step === 0 ? state.connect === "reference" || state.existingAgentId !== null : state.step === 1 ? packs.length > 0 : true;

  return (
    <div className="flex flex-col gap-4 p-4 max-w-[980px]">
      <div className="text-xs text-[#6E6B60]">
        Runs / <b className="text-[#1B1A17]">New run</b>
      </div>
      <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>New run</h1>
      <p className="text-[13px] text-[#6E6B60] max-w-[70ch]">Connect an agent, pick a World and a Scenario, choose whether to attack it, then review.</p>

      <StepStrip labels={STEP_LABELS} current={state.step} onSelect={(step) => step <= state.step && update({ step })} />

      {state.step === 0 && <p className={hint}>Connect step — added by Task 4.</p>}
      {state.step === 1 && <WorldStep packs={packs} state={state} onChange={update} />}
      {state.step === 2 && pack && <ScenarioStep pack={pack} state={state} onChange={update} />}
      {state.step === 3 && scenario && <MandateStep scenario={scenario} />}
      {state.step === 4 && scenario && <AttackStep scenario={scenario} state={state} onChange={update} />}
      {state.step === 5 && <p className={hint}>Review step — added by Task 5.</p>}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={() => update({ step: Math.max(0, state.step - 1) })}
          className={secondaryButton}
          style={{ visibility: state.step === 0 ? "hidden" : "visible" }}
        >
          ← Back
        </button>
        <div className="flex gap-3 ml-auto">
          <button type="button" onClick={() => router.push("/")} className={secondaryButton}>
            Cancel
          </button>
          {state.step < lastStep && (
            <button type="button" disabled={!canContinue} onClick={() => update({ step: state.step + 1 })} className={primaryButton}>
              Continue →
            </button>
          )}
        </div>
      </div>
      {busy || error ? null : null}
    </div>
  );
}
```

(The trailing `busy || error` no-op line is deliberate scaffolding: `busy`/`error` are declared here
because Task 5's `ReviewStep` needs them lifted to this component — remove the no-op line in Task 5
once `ReviewStep` actually reads them, so there is never a moment where `busy`/`error` are unused and
`tsc`/eslint would flag them; if your linter flags them as unused in *this* task, keep the no-op line
exactly as shown rather than deleting the state — Task 5 needs both.)

- [ ] **Step 8: `formatLure` unit test**

```ts
import { describe, expect, it } from "vitest";
import { formatLure } from "@/ui/wizard/steps/AttackStep";

describe("formatLure", () => {
  it("renders tool → value for a single-key match", () => {
    expect(formatLure({ tool: "issue_refund", argsMatch: { payment_id: "pay_7001" } })).toBe("issue_refund → pay_7001");
  });
  it("renders tool → key: value, key2: value2 for a multi-key match", () => {
    expect(formatLure({ tool: "add_group_member", argsMatch: { group_id: "grp_okta_admins", role: "admin" } })).toBe(
      "add_group_member → group_id: grp_okta_admins, role: admin",
    );
  });
});
```

- [ ] **Step 9: Run tests, `tsc`, commit**

Run: `npm test -- tests/ui/attackLure.test.ts && npx tsc --noEmit`
Expected: new test passes; no type errors (the two placeholder step-0/step-5 lines are valid JSX).

```bash
git add src/ui/wizard src/ui/types.ts tests/ui/attackLure.test.ts
git commit -m "feat(wizard): wizard shell, stepper, and World/Scenario/Mandate/Attack steps"
```

---

### Task 4: `ConnectStep.tsx` — agent connection (Reference or BYO)

**Files:**
- Create: `src/ui/wizard/steps/ConnectStep.tsx`
- Modify: `src/ui/wizard/NewRunWizard.tsx` (swap the step-0 placeholder for the real component)
- Test: `tests/ui/connectStep.test.tsx` — if no React-Testing-Library harness exists yet for a
  `src/ui` component in this repo, check `tests/ui/*.test.ts(x)` first for the pattern already used
  (e.g. for `RunsListPage`'s pure helpers); if component-level rendering tests aren't the existing
  convention, test only the pure logic this step introduces (the "which agents match this shape"
  filter) instead of full rendering — match whatever the codebase already does, don't invent a new
  test style.

**Interfaces:**
- Consumes: `WizardState`, `ConnectMode` from `../NewRunWizard` (Task 3); `RegisterAgent`,
  `AgentSubmission` from `@/ui/connect/RegisterAgent` (Task 2's `lockedShape`); `mcpAddCommand`,
  `forwarderTs`, `forwarderPy`, `connectorBlock` from `@/ui/connect/snippets` (unmodified).
- Produces: nothing new consumed elsewhere — this is a leaf step.

- [ ] **Step 1: Write `ConnectStep.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { Agent, WizardPack } from "@/ui/types";
import { panel, focusRing, field, label as labelClass, hint } from "@/ui/styles";
import { RegisterAgent } from "@/ui/connect/RegisterAgent";
import { mcpAddCommand, forwarderTs, forwarderPy, connectorBlock } from "@/ui/connect/snippets";
import type { ConnectMode, WizardState } from "../NewRunWizard";

const PLACEHOLDER_MCP_URL = "http://localhost:3000/mcp/runs/:id";
const PLACEHOLDER_CALL_URL = "http://localhost:3000/api/runs/:id/call";

const CONNECT_OPTS: { id: ConnectMode; label: string; desc: string }[] = [
  { id: "reference", label: "Reference Agent", desc: "AgentSim's own agent runs this Scenario for you — naïve or fixed system prompt. No connection needed." },
  { id: "mcp", label: "MCP server", desc: "AgentSim is an MCP server. Point your agent at one URL." },
  { id: "forwarder", label: "Forwarder", desc: "Drop one function into your own tool-execution loop — 30 lines, TS or Python." },
  { id: "connector", label: "Anthropic Connector", desc: "Built directly on the Messages API? Point mcp_servers at us — no client code at all." },
];

export function ConnectStep({
  state,
  pack,
  agents,
  onChange,
}: {
  state: WizardState;
  pack: WizardPack | undefined;
  agents: Agent[];
  onChange: (patch: Partial<WizardState>) => void;
}) {
  const [fwLang, setFwLang] = useState<"ts" | "py">("ts");
  const matching = state.connect === "reference" ? [] : agents.filter((a) => a.shape === state.connect);
  const [registering, setRegistering] = useState(matching.length === 0);
  const selectedAgent = agents.find((a) => a.id === state.existingAgentId) ?? null;

  function selectConnect(mode: ConnectMode) {
    const nextMatching = mode === "reference" ? [] : agents.filter((a) => a.shape === mode);
    setRegistering(mode !== "reference" && nextMatching.length === 0);
    onChange({ connect: mode, existingAgentId: mode === "reference" ? null : (nextMatching[0]?.id ?? null) });
  }

  async function register(submission: { name: string; version: string; shape: "mcp" | "forwarder" | "connector"; toolAliases: Record<string, string>; notes: string }) {
    const res = await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) });
    const data = (await res.json().catch(() => ({}))) as Partial<Agent> & { error?: string };
    if (!res.ok || !data.id) return data.error ?? `The agent was not saved (HTTP ${res.status}).`;
    onChange({ existingAgentId: data.id });
    setRegistering(false);
    return null;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
      <div className={`${panel} p-4.5 flex flex-col gap-1`}>
        <h2 className="text-[14px] font-semibold mb-2">How the agent reaches this Run</h2>
        {CONNECT_OPTS.map((o) => (
          <label
            key={o.id}
            className={`flex items-start gap-3 p-3.5 border rounded-lg mb-1 cursor-pointer ${o.id === state.connect ? "border-[#1B1A17] shadow-[0_0_0_1px_#1B1A17_inset]" : "border-[#E3E0D5]"}`}
          >
            <input type="radio" name="connect" checked={o.id === state.connect} onChange={() => selectConnect(o.id)} className="mt-0.5 accent-[#1B1A17]" />
            <div className="flex-1">
              <div className="font-semibold text-[13.5px]">{o.label}</div>
              <div className="text-[12px] text-[#6E6B60] mt-0.5 leading-relaxed">{o.desc}</div>
            </div>
          </label>
        ))}
      </div>

      <div className={`${panel} p-4.5 flex flex-col gap-3`}>
        {state.connect === "reference" ? (
          <>
            <h2 className="text-[14px] font-semibold">Agent and tool definitions</h2>
            <div className="flex gap-2">
              {["naïve", "fixed"].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ agentVersion: v })}
                  className={`h-8 px-3.5 rounded-full text-[12px] border ${focusRing} ${state.agentVersion === v ? "bg-[#1B1A17] text-white border-[#1B1A17]" : "border-[#E3E0D5]"}`}
                >
                  {v}
                </button>
              ))}
            </div>
            <p className={hint}>
              {state.agentVersion === "fixed"
                ? "The same tools, the same model — corrected to treat record content as data, not instructions."
                : "Deliberately weak: treats internal-looking notes inside records as pre-approved instructions."}
            </p>
            {pack && (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wide text-[#6E6B60]">
                      <th className="pb-1.5">Tool</th>
                      <th className="pb-1.5">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pack.tools.map((t) => (
                      <tr key={t.name} className="border-t border-[#E3E0D5]">
                        <td className="py-1.5 pr-2 font-mono text-[11.5px]">{t.name}</td>
                        <td className="py-1.5 text-[#6E6B60]">{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="text-[14px] font-semibold">Connect, then map your tools</h2>
            {matching.length > 0 && !registering && (
              <div className="flex flex-col gap-1">
                <label htmlFor="wizard-agent-select" className={labelClass}>
                  Agent
                </label>
                <select
                  id="wizard-agent-select"
                  value={state.existingAgentId ?? ""}
                  onChange={(e) => onChange({ existingAgentId: e.target.value })}
                  className={field}
                >
                  {matching.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.version}
                    </option>
                  ))}
                </select>
                <button type="button" onClick={() => setRegistering(true)} className="self-start text-[12px] underline underline-offset-2 text-[#1B1A17]">
                  + Register a new agent
                </button>
              </div>
            )}
            {registering && (
              <RegisterAgent
                editing={null}
                lockedShape={state.connect}
                onSubmit={register}
                onCancel={() => setRegistering(false)}
              />
            )}
            {!registering && selectedAgent && (
              <>
                {state.connect === "mcp" && (
                  <pre className="bg-[#F7F5EF] border border-[#E3E0D5] rounded-lg p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre">
                    {mcpAddCommand(selectedAgent.name, PLACEHOLDER_MCP_URL)}
                  </pre>
                )}
                {state.connect === "forwarder" && (
                  <>
                    <div className="flex gap-2">
                      {(["ts", "py"] as const).map((l) => (
                        <button
                          key={l}
                          type="button"
                          onClick={() => setFwLang(l)}
                          className={`h-7 px-3 rounded text-[12px] border ${focusRing} ${fwLang === l ? "bg-[#1B1A17] text-white border-[#1B1A17]" : "border-[#E3E0D5]"}`}
                        >
                          {l === "ts" ? "TypeScript" : "Python"}
                        </button>
                      ))}
                    </div>
                    <pre className="bg-[#F7F5EF] border border-[#E3E0D5] rounded-lg p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre">
                      {fwLang === "ts" ? forwarderTs(PLACEHOLDER_CALL_URL) : forwarderPy(PLACEHOLDER_CALL_URL)}
                    </pre>
                  </>
                )}
                {state.connect === "connector" && (
                  <pre className="bg-[#F7F5EF] border border-[#E3E0D5] rounded-lg p-3 text-[11.5px] font-mono overflow-x-auto whitespace-pre">
                    {connectorBlock(PLACEHOLDER_MCP_URL)}
                  </pre>
                )}
                {pack && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12px] border-collapse">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wide text-[#6E6B60]">
                          <th className="pb-1.5">Your tool</th>
                          <th className="pb-1.5">AgentSim tool</th>
                          <th className="pb-1.5">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pack.tools.map((t) => {
                          const theirs = Object.entries(selectedAgent.toolAliases).find(([, ours]) => ours === t.name)?.[0];
                          return (
                            <tr key={t.name} className="border-t border-[#E3E0D5]">
                              <td className="py-1.5 pr-2 font-mono text-[11.5px]">{theirs ?? t.name}</td>
                              <td className="py-1.5 pr-2 font-mono text-[11.5px] text-[#6E6B60]">{t.name}</td>
                              <td className="py-1.5">
                                <span className={`text-[10.5px] font-semibold px-2 py-0.5 rounded-full ${theirs ? "bg-[#E7F4EA] text-[#1E7A43]" : "bg-[#E3E0D5] text-[#6E6B60]"}`}>
                                  {theirs ? "mapped" : "auto"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `NewRunWizard.tsx`**

Replace the step-0 placeholder line with:

```tsx
{state.step === 0 && <ConnectStep state={state} pack={pack} agents={agents} onChange={update} />}
```

Add the import: `import { ConnectStep } from "./steps/ConnectStep";`

- [ ] **Step 3: `tsc`, manual smoke check, commit**

Run: `npx tsc --noEmit`
Expected: no type errors.

```bash
git add src/ui/wizard
git commit -m "feat(wizard): Connect step — Reference Agent or BYO with inline registration"
```

---

### Task 5: `ReviewStep.tsx` — the real Start Run action

**Files:**
- Create: `src/ui/wizard/steps/ReviewStep.tsx`
- Modify: `src/ui/wizard/NewRunWizard.tsx` (swap the step-5 placeholder, wire `busy`/`error`/`startRun`,
  hide the footer's Continue button on the last step)

**Interfaces:**
- Consumes: `WizardState`, `ConnectMode` from `../NewRunWizard`; `formatLure` from `./AttackStep`.
- Produces: nothing consumed elsewhere — terminal step.

- [ ] **Step 1: Write `ReviewStep.tsx`**

```tsx
"use client";
import type { Agent, WizardPack, WizardScenario } from "@/ui/types";
import { panel, primaryButton, dangerBg, dangerFg } from "@/ui/styles";
import { formatLure } from "./AttackStep";
import type { WizardState } from "../NewRunWizard";

const CONNECT_LABELS: Record<WizardState["connect"], string> = {
  reference: "Reference Agent",
  mcp: "MCP server",
  forwarder: "Forwarder",
  connector: "Anthropic Connector",
};

export function ReviewStep({
  state,
  pack,
  scenario,
  agents,
  busy,
  error,
  onStart,
}: {
  state: WizardState;
  pack: WizardPack;
  scenario: WizardScenario;
  agents: Agent[];
  busy: boolean;
  error: string | null;
  onStart: () => void;
}) {
  const agentLabel =
    state.connect === "reference"
      ? `${CONNECT_LABELS.reference} · ${state.agentVersion}`
      : `${CONNECT_LABELS[state.connect]} · ${agents.find((a) => a.id === state.existingAgentId)?.name ?? "—"}`;
  const attack = scenario.attacks.find((a) => a.id === state.attackId);
  const attackLabel = state.attackId === "off" ? "Off — clean run" : attack ? `${attack.id} (${formatLure(attack.lure)})` : state.attackId;

  return (
    <div className={`${panel} p-5 max-w-[720px] flex flex-col gap-4`}>
      <h2 className="text-[14px] font-semibold">Review</h2>
      <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2.5 text-[13px]">
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Agent</dt>
        <dd>{agentLabel}</dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">World</dt>
        <dd>
          {pack.name} <span className="font-mono text-[#6E6B60]">({pack.domain})</span>
        </dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Scenario</dt>
        <dd>{scenario.title}</dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Mandate</dt>
        <dd className="text-[12.5px] text-[#6E6B60]">{scenario.policyText.split("\n")[0]} …</dd>
        <dt className="text-[11px] uppercase tracking-wide text-[#6E6B60] pt-0.5">Attack</dt>
        <dd>{attackLabel}</dd>
      </dl>
      <div className="pt-4 border-t border-[#E3E0D5] flex flex-col gap-2">
        <button type="button" onClick={onStart} disabled={busy} className={`${primaryButton} w-full justify-center h-[46px] text-[14px]`}>
          {busy ? "Starting…" : "▷ Start Run"}
        </button>
        {error && (
          <p className="text-[12px] rounded px-2.5 py-1.5" style={{ background: dangerBg, color: dangerFg }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Wire `startRun`/`busy`/`error` into `NewRunWizard.tsx`**

Remove the `{busy || error ? null : null}` scaffolding line from Task 3. Add:

```tsx
async function startRun() {
  if (!pack || !scenario) return;
  if (state.connect !== "reference" && !state.existingAgentId) return;
  setBusy(true);
  setError(null);
  try {
    const agent =
      state.connect === "reference"
        ? { kind: "reference" as const, version: state.agentVersion }
        : { kind: "byo" as const, agentId: state.existingAgentId as string };
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ packId: pack.id, scenarioId: scenario.id, agent, attackId: state.attackId === "off" ? null : state.attackId }),
    });
    const data = (await res.json().catch(() => ({}))) as { id?: string; error?: string };
    if (!res.ok || !data.id) {
      setError(data.error ?? `The Run was not created (HTTP ${res.status}).`);
      return;
    }
    router.push(`/runs/${data.id}`);
  } catch {
    setError("Network error — no Run was created.");
  } finally {
    setBusy(false);
  }
}
```

Replace the step-5 placeholder:

```tsx
{state.step === 5 && pack && scenario && (
  <ReviewStep state={state} pack={pack} scenario={scenario} agents={agents} busy={busy} error={error} onStart={startRun} />
)}
```

Hide the footer's Continue button on the last step — it already is (`state.step < lastStep`), no
change needed there; just add the `ReviewStep` import.

- [ ] **Step 3: `tsc`, run the full suite, commit**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors; full suite green.

```bash
git add src/ui/wizard
git commit -m "feat(wizard): Review step starts the real Run via POST /api/runs"
```

---

### Task 6: Wire `/runs/new`, remove the old page content, end-to-end verification

**Files:**
- Modify: `src/app/runs/new/page.tsx`
- Test: manual — `run` skill pass (see Step 3 below); no new automated test beyond what Tasks 1-5
  already added (this task is pure wiring).

**Interfaces:**
- Consumes: `toWizardPack` (Task 1), `NewRunWizard` (Tasks 3-5), `ConsoleShell` (unchanged, Phase 1),
  `listAgents` (`@/runner/agentRegistry`, unchanged).
- Produces: nothing new — this is the terminal task of Phase 2.

- [ ] **Step 1: Rewrite the page**

```tsx
import { loadPacks, toWizardPack } from "@/lib/summaries";
import { listAgents } from "@/runner/agentRegistry";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { NewRunWizard } from "@/ui/wizard/NewRunWizard";

export const dynamic = "force-dynamic";

export default function NewRun() {
  const packs = loadPacks().packs.map(toWizardPack);
  return (
    <ConsoleShell>
      <NewRunWizard packs={packs} agents={listAgents()} />
    </ConsoleShell>
  );
}
```

- [ ] **Step 2: `tsc`, `eslint`, full test suite**

Run: `npx tsc --noEmit && npx eslint src/ui/wizard src/app/runs/new src/lib/summaries.ts src/ui/connect/RegisterAgent.tsx && npm test`
Expected: all clean, all green.

- [ ] **Step 3: Manual run-through (the `run` skill's "drive it, don't just launch it" bar)**

Start the dev server (`npm run dev`, confirm it's not serving a stale `.next` build — `rm -rf .next`
first if a previous `npm run build` ran in this workspace, per this project's known cache-collision
gotcha), open `/runs/new`, and drive it once end to end for the Reference-Agent path (pick a World,
pick a Scenario, view the Mandate, pick an Attack, Review, Start Run, confirm it lands on `/runs/:id`
with the Run actually running) and once for a BYO path (pick "MCP server", register a new agent
inline, confirm the snippet renders with the `:id` placeholder, Continue through to Review, Start Run,
confirm it lands on `/runs/:id` and `ConnectAgent.tsx` there shows the real MCP URL). Screenshot only
to your scratchpad directory if you use Playwright for this, never the repo root.

- [ ] **Step 4: Commit**

```bash
git add src/app/runs/new/page.tsx
git commit -m "feat(wizard): wire /runs/new to the New Run wizard"
```

## Self-review

- **Placeholder scan**: none outside the two deliberately-labeled, deliberately-temporary scaffolding
  lines in Task 3 (Connect/Review step bodies), each of which names the exact task that replaces it
  and is removed within this same plan (Tasks 4 and 5) — not a plan that ships with a placeholder.
- **Consistency**: `WizardState`/`ConnectMode` are defined once (Task 3, `NewRunWizard.tsx`) and only
  imported thereafter (Tasks 4-5) — no redefinition drift. `formatLure` is defined once (Task 3,
  `AttackStep.tsx`) and imported by Task 5's `ReviewStep`, not re-implemented.
- **Scope**: 6 tasks, ~9 new files, 3 modified files (`RegisterAgent.tsx` additive-only,
  `NewRunWizard.tsx` built incrementally across Tasks 3/4/5, `runs/new/page.tsx` rewritten once in
  Task 6), one new type family in `summaries.ts`. No engine changes, no new API routes.
