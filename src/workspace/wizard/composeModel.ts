// The create wizard's pure model, shared by "new agent" and "new world": both are composed from the
// same sources (shadowed MCP providers, your own tools, a database schema, a copied pack), so both
// flows read the same shape. Sources reuse the console's data model in `ui/worlds/newWorld/sources`.
import type { DraftWorldInput } from "@/workspace/worlds";
import type { PackPick, ProviderInfo, Source } from "@/ui/worlds/newWorld/sources";
import type { HandshakeStep } from "@/workspace/handshake";
import type { DraftDetails, DraftSystem, DraftTool } from "@/runner/agentRegistry";
import { entityRefs, toolKind } from "@/workspace/worldDetail";

export type { PackPick, ProviderInfo, Source } from "@/ui/worlds/newWorld/sources";
export { FORMAT_LABEL, SRC_KIND, srcLabel, srcMode, srcToolCount } from "@/ui/worlds/newWorld/sources";

export type Target = "agent" | "world";
export type How = "plugin" | "compose" | "attach" | "draft";

/** The middle step is what the chosen path does: the plugin generates, everything else composes. */
export function stepLabels(how: How | null): readonly string[] {
  return how === "plugin" ? ["How", "Generate", "Review"] : STEPS;
}
export type ToolFormat = Extract<Source, { kind: "tools" }>["format"];

export const STEPS = ["How", "Compose", "Review"] as const;

export type HowOption = { id: How; title: string; body: string; badge?: string };

export const HOW_OPTIONS: Record<Target, HowOption[]> = {
  agent: [
    { id: "plugin", title: "Connect through the MCP plugin", body: "Install the plugin next to your agent. It brings the tools, entities and mandate across by itself.", badge: "Recommended" },
    { id: "compose", title: "Compose it yourself", body: "Pick the third-party MCPs and tools the agent can reach, and write its mandate." },
  ],
  world: [
    { id: "plugin", title: "Generate with the worldbuilder plugin", body: "Run the plugin from the agent's own repo. It reads the tools, schema and policies there and drafts the World's structure here for review.", badge: "Recommended" },
    { id: "draft", title: "Draft from the agent's tools", body: "AgentSim seeds a company around the tools the agent already has and writes clean and poisoned scenarios.", badge: "Fastest" },
    { id: "compose", title: "Compose from sources", body: "Several third-party MCPs, your own tool definitions, a database. One sandbox with one ownership graph." },
    { id: "attach", title: "Attach an installed World", body: "Use one of the packs already on disk as this agent's exam room." },
  ],
};

/** Tool names from pasted text: an MCP tools/list payload, TypeScript exports, or one per line / comma. */
export function toolLines(text: string, format: ToolFormat): string[] {
  const t = text.trim();
  if (!t) return [];
  if (format === "mcp" && t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t) as { tools?: { name?: string }[] };
      const names = (parsed.tools ?? []).map((x) => x.name).filter((n): n is string => !!n);
      if (names.length) return dedupe(names);
    } catch {
      /* not JSON after all: fall through to lines */
    }
  }
  if (format === "ts") {
    const names = [...t.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]);
    if (names.length) return dedupe(names);
  }
  return dedupe(t.split(/\r?\n|,/).map((s) => s.trim()).filter(Boolean));
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

export function composedTools(sources: Source[], providers: ProviderInfo[]): string[] {
  return dedupe(
    sources.flatMap((s) => {
      if (s.kind === "mcp") return providers.find((p) => p.id === s.provider)?.tools.map((t) => t.name) ?? [];
      if (s.kind === "tools") return toolLines(s.text, s.format);
      return [];
    }),
  );
}

/** Table names from DDL, in order of appearance. */
export function ddlTables(ddl: string): string[] {
  return dedupe([...ddl.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?["`]?([A-Za-z_][\w]*)/gi)].map((m) => m[1]));
}

const titleCase = (s: string) => s.split(/[_\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");

export function composedEntities(sources: Source[]): string[] {
  return dedupe(sources.flatMap((s) => (s.kind === "db" ? ddlTables(s.ddl).map(titleCase) : [])));
}

export function domainOf(sources: Source[], providers: ProviderInfo[], packs: PackPick[]): string {
  const mcp = sources.find((s) => s.kind === "mcp");
  if (mcp && mcp.kind === "mcp") return providers.find((p) => p.id === mcp.provider)?.kind ?? "composed";
  const pack = sources.find((s) => s.kind === "pack");
  if (pack && pack.kind === "pack") return packs.find((p) => p.id === pack.packId)?.domain ?? "composed";
  return "composed";
}

/** One System per source, with the tools each contributes, so the World page can show where everything came from. */
export function detailsFromComposition(sources: Source[], providers: ProviderInfo[], packs: PackPick[], extra: { entities: string[]; mandate: string }): DraftDetails {
  const systems: DraftSystem[] = [];
  const toolDefs: DraftTool[] = [];
  let ownAdded = false;
  for (const s of sources) {
    if (s.kind === "mcp") {
      const p = providers.find((x) => x.id === s.provider);
      if (!p) continue;
      systems.push({ key: p.id, label: p.label, kind: "mcp", mode: "shadowed", provider: p.id, tools: p.tools.length });
      for (const t of p.tools) toolDefs.push({ name: t.name, system: p.id, kind: toolKind(t.name), description: t.description });
    } else if (s.kind === "tools") {
      const names = toolLines(s.text, s.format);
      if (!ownAdded) {
        systems.push({ key: "own-tools", label: "Your tools", kind: "tools", mode: "pasted", tools: 0 });
        ownAdded = true;
      }
      const own = systems.find((x) => x.key === "own-tools");
      if (own) own.tools += names.length;
      for (const n of names) toolDefs.push({ name: n, system: "own-tools", kind: toolKind(n), description: `Declared in the pasted ${FORMAT_LABEL_LOCAL[s.format]} definition.` });
    } else if (s.kind === "db") {
      if (!systems.some((x) => x.key === "database")) systems.push({ key: "database", label: "Database", kind: "db", mode: "mocked", tools: 0 });
    } else if (s.kind === "pack") {
      const p = packs.find((x) => x.id === s.packId);
      if (p) systems.push({ key: p.id, label: p.name, kind: "tools", mode: "copied", tools: p.tools });
    }
  }
  const entities = entityRefs(dedupe([...composedEntities(sources), ...extra.entities]));
  return { systems, toolDefs, entities, principal: entities[0]?.label ?? "Customer", mandate: extra.mandate, scenarioTitles: [] };
}

const FORMAT_LABEL_LOCAL: Record<ToolFormat, string> = { mcp: "MCP tools/list", openapi: "OpenAPI", ts: "TypeScript" };

export function worldDraftFromComposition(name: string, description: string, sources: Source[], providers: ProviderInfo[], packs: PackPick[], extra: { entities: string[]; mandate: string } = { entities: [], mandate: "" }): DraftWorldInput {
  const tools = composedTools(sources, providers).length + sources.reduce((n, s) => n + (s.kind === "pack" ? (packs.find((p) => p.id === s.packId)?.tools ?? 0) : 0), 0);
  const tables = sources.reduce((n, s) => n + (s.kind === "db" ? ddlTables(s.ddl).length : 0), 0);
  return {
    name: name.trim(),
    domain: domainOf(sources, providers, packs),
    description: description.trim(),
    tools,
    scenarios: Math.max(2, Math.min(8, Math.round(Math.max(tools, 2) * 0.8))),
    rows: 12 + tools * 4 + tables * 8,
    details: detailsFromComposition(sources, providers, packs, extra),
  };
}

export function canContinue(step: number, how: How | null, s: { name: string; sources: Source[]; packId: string | null; hasDraft?: boolean }): boolean {
  if (step === 0) return how !== null;
  if (step === 1) {
    if (how === "attach") return s.packId !== null;
    if (how === "compose") return s.name.trim() !== "" && s.sources.length > 0;
    if (how === "plugin") return s.hasDraft === true;
    return true;
  }
  return true;
}

/** What the Review step plays while an agent is registered. Short: nothing is generated. */
export function buildAgentCreateScript(name: string, toolCount: number): HandshakeStep[] {
  return [
    { text: `recording ${toolCount} tool${toolCount === 1 ? "" : "s"} and their sources`, at: 0 },
    { text: "writing the mandate into the registry", at: 600 },
    { text: `drafting ${name}'s first World from the same sources`, at: 1200 },
    { text: `registered ${name}`, at: 1900, done: true },
  ];
}
