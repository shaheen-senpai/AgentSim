// The two list-shaped views of a World pack the UI and the API both hand out. One definition, so a
// pack card and a Launcher dropdown can never drift apart.
import type { Scenario, WorldPack } from "@/engine/pack";

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
};

/** The Launcher's view of one pack: its Scenarios and the Reference Agent versions it ships. */
export type PackOption = {
  id: string;
  name: string;
  scenarios: ScenarioSummary[];
  agentVersions: string[];
};

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
  };
}
