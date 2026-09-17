// The World page's view model, built the same way for a pack on disk and for a drafted World, so
// one page renders both. Pure; server pages call it and hand the result down.
import type { EntitySpec, WorldPack } from "@/engine/pack";
import type { DraftDetails, DraftSystem, DraftTool, DraftWorld } from "@/runner/agentRegistry";
import type { Agent } from "@/ui/types";

export type WorldDetailView = {
  id: string;
  kind: "pack" | "draft";
  name: string;
  domain: string;
  description: string;
  systems: DraftSystem[];
  principal: string;
  entities: { name: string; label: string; fields: number | null; owner: string | null }[];
  tools: DraftTool[];
  mandates: { label: string; text: string }[];
  scenarios: { id: string; title: string; policy: string; attacked: boolean }[];
  /** The console's own page for an installed pack, with the YAML editor. */
  consoleHref?: string;
};

const WRITE_VERBS = /(^|[._-])(create|update|delete|remove|set|send|post|write|transition|approve|escalate|schedule|file|submit|publish|reset|assign|close|cancel|refund|charge|move|edit|upload)([._-]|$)/i;

export function toolKind(name: string): "read" | "write" {
  return WRITE_VERBS.test(name) ? "write" : "read";
}

/** `jira.issues.search` → `jira`; a tool with no namespace belongs to `core`. */
export function systemKey(name: string): string {
  const i = name.indexOf(".");
  return i > 0 ? name.slice(0, i).toLowerCase() : "core";
}

const titleCase = (s: string) => s.split(/[_\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

const SCENARIOS: { title: string; attacked: boolean }[] = [
  { title: "The routine shift", attacked: false },
  { title: "An instruction hidden in a record", attacked: true },
  { title: "A duplicate request", attacked: false },
  { title: "A request outside the mandate", attacked: true },
  { title: "The end-of-quarter rush", attacked: false },
  { title: "Someone else's records", attacked: true },
  { title: "A forged approval", attacked: false },
  { title: "The aggregate budget", attacked: true },
];

export function draftScenarios(n: number): { title: string; attacked: boolean }[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => SCENARIOS[i % SCENARIOS.length]);
}

export function entityRefs(entities: string[]): { name: string; label: string }[] {
  return entities.map((e) => ({ name: e.trim().toLowerCase().replace(/\s+/g, "_"), label: e.trim() }));
}

/** Details for a World drafted from an agent's own tool list: one pasted System per namespace. */
export function detailsFromTools(tools: string[], entities: string[], mandate: string): DraftDetails {
  const groups = new Map<string, string[]>();
  for (const t of tools) {
    const k = systemKey(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  const systems: DraftSystem[] = [...groups].map(([key, names]) => ({ key, label: titleCase(key), kind: "tools", mode: "pasted", tools: names.length }));
  const toolDefs: DraftTool[] = tools.map((name) => ({ name, system: systemKey(name), kind: toolKind(name), description: `${toolKind(name) === "write" ? "Writes" : "Reads"} through the agent's own ${titleCase(systemKey(name))} tool.` }));
  const refs = entityRefs(entities);
  return { systems, toolDefs, entities: refs, principal: refs[0]?.label ?? "Employee", mandate, scenarioTitles: [] };
}

export function draftDetailView(world: DraftWorld, agent: Agent): WorldDetailView {
  const d = world.details ?? detailsFromTools(agent.tools, agent.entities, agent.mandate);
  const scenarios = draftScenarios(world.scenarios).map((s, i) => ({ id: `draft-${i + 1}`, title: d.scenarioTitles[i] ?? s.title, policy: d.mandate, attacked: s.attacked }));
  return {
    id: world.id,
    kind: "draft",
    name: world.name,
    domain: world.domain,
    description: world.description,
    systems: d.systems,
    principal: d.principal,
    entities: d.entities.map((e) => ({ ...e, fields: null, owner: null })),
    tools: d.toolDefs,
    mandates: d.mandate ? [{ label: "Agent mandate", text: d.mandate }] : [],
    scenarios,
  };
}

function ownerOf(spec: EntitySpec): string {
  return spec.owner === "self" ? "self" : spec.owner.via;
}

export function packDetailView(pack: WorldPack): WorldDetailView {
  const tools = Object.values(pack.tools);
  const systems: DraftSystem[] = Object.entries(pack.meta.systems).map(([key, sys]) => ({
    key,
    label: sys.label,
    kind: sys.kind ?? "tools",
    mode: sys.mode === "localstack" ? "mocked" : (sys.mode ?? "pasted"),
    provider: sys.provider,
    tools: tools.filter((t) => t.system === key).length,
  }));
  return {
    id: pack.meta.id,
    kind: "pack",
    name: pack.meta.name,
    domain: pack.meta.domain,
    description: pack.meta.description,
    systems,
    principal: pack.meta.entities[pack.meta.principal]?.label ?? pack.meta.principal,
    entities: Object.entries(pack.meta.entities).map(([name, spec]) => ({ name, label: spec.label, fields: Object.keys(spec.fields).length, owner: ownerOf(spec) })),
    tools: tools.map((t) => ({ name: t.name, system: t.system, kind: t.kind, description: t.description })),
    mandates: pack.scenarios.map((s) => ({ label: s.title, text: s.policy.text })),
    scenarios: pack.scenarios.map((s) => ({ id: s.id, title: s.title, policy: s.policy.text, attacked: s.attacks.length > 0 })),
    consoleHref: `/worlds/${pack.meta.id}`,
  };
}
