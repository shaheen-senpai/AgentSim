// The two list-shaped views of a World pack the UI and the API both hand out. One definition, so a
// pack card and a Launcher dropdown can never drift apart — plus the one tolerant loader every
// list-shaped call site reads packs through.
import { listPackIds, loadPack, type Scenario, type WorldPack } from "@/engine/pack";
import { DIMENSIONS, type Dimension } from "@/engine/dimensions";

export type ScenarioSummary = {
  id: string;
  packId: string;
  title: string;
  attacks: { id: string; title: string }[];
};

export type PackSummary = {
  id: string;
  name: string;
  domain: string;
  description: string;
  principal: string;
  collections: number;
  rows: number;
  tools: number;
  scenarios: number;
  systems: number;
};

/** The Launcher's view of one pack: its Scenarios and the Reference Agent versions it ships. */
export type PackOption = {
  id: string;
  name: string;
  scenarios: ScenarioSummary[];
  agentVersions: string[];
};

/** A World pack on disk that no longer parses, and why. */
export type BrokenPack = { id: string; message: string };

/**
 * Every installed World pack that still loads, plus the ones that do not.
 *
 * One pack hand-edited into an invalid state must never take a list down with it — least of all the
 * home page and the Run page, from which `/worlds/:id` (the editor you would *fix* it in) is
 * reached. Every list-shaped call site — `/`, `/runs/:id`, `/worlds`, `/connect`, `GET /api/worlds`
 * and `GET /api/scenarios` — reads packs through this one function, so the rule has one
 * implementation rather than six. Callers that want a single named pack still use `loadPack`
 * directly and surface its error: `/worlds/:id` exists precisely to show it.
 */
export function loadPacks(): { packs: WorldPack[]; broken: BrokenPack[] } {
  const packs: WorldPack[] = [];
  const broken: BrokenPack[] = [];
  for (const id of listPackIds()) {
    try {
      packs.push(loadPack(id));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`[worlds] skipping unloadable World pack ${id}: ${message}`);
      broken.push({ id, message });
    }
  }
  return { packs, broken };
}

export function toScenarioSummary(s: Scenario, packId: string): ScenarioSummary {
  return { id: s.id, packId, title: s.title, attacks: s.attacks.map((a) => ({ id: a.id, title: a.title })) };
}

export function toPackOption(p: WorldPack): PackOption {
  return {
    id: p.meta.id,
    name: p.meta.name,
    scenarios: p.scenarios.map((s) => toScenarioSummary(s, p.meta.id)),
    agentVersions: Object.keys(p.agents),
  };
}

export function toPackSummary(p: WorldPack): PackSummary {
  return {
    id: p.meta.id,
    name: p.meta.name,
    domain: p.meta.domain,
    description: p.meta.description,
    principal: p.meta.principal,
    collections: Object.keys(p.meta.entities).length,
    rows: Object.values(p.seed.rows).reduce((n, rows) => n + rows.length, 0),
    tools: Object.keys(p.tools).length,
    scenarios: p.scenarios.length,
    systems: Object.keys(p.meta.systems).length,
  };
}

export type WizardAttack = { id: string; title: string; lure: { tool: string; argsMatch: Record<string, unknown> } };
export type WizardTool = { name: string; description: string; op: string; collection: string };
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
  /** The principal entity's display label — "Customer", "Employee". */
  principalLabel: string;
  entities: number;
  systems: number;
  tools: WizardTool[];
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
    principalLabel: p.meta.entities[p.meta.principal]?.label ?? p.meta.principal,
    entities: Object.keys(p.meta.entities).length,
    systems: new Set(Object.values(p.tools).map((t) => t.system)).size,
    tools: Object.values(p.tools).map((t) => ({ name: t.name, description: t.description, op: t.op, collection: t.collection })),
    scenarios: p.scenarios.map((s) => toWizardScenario(s, p.meta.id)),
  };
}
