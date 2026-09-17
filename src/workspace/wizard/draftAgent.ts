// A worldbuilder draft is what the plugin learned about the agent from its repo — its tools, its
// entities, the Mandates its policy docs state. Registering that as the agent (attached to the
// World the draft becomes) is how "Import via MCP" works. Pure; browser-safe.
import { parse } from "yaml";
import type { AgentInput } from "@/runner/agentRegistry";
import { draftTools } from "@/ui/worlds/newWorld/draftView";

type Files = Record<string, string>;
export type DraftForAgent = { input: { name: string; domain: string; description: string }; files: Files; client?: string; repo?: string };

/** Every mandate text in the draft's pack.yaml, in order, as one paragraph; "" when it declares none. */
export function draftMandate(files: Files): string {
  try {
    const pack = parse(files["pack.yaml"] ?? "") as { mandates?: Record<string, { text?: string }> } | null;
    return Object.values(pack?.mandates ?? {})
      .map((m) => m?.text?.trim())
      .filter((t): t is string => !!t)
      .join(" ");
  } catch {
    return "";
  }
}

const titleCase = (s: string) => s.split(/[_\s-]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/** Entity labels from the draft's pack.yaml (`label`, or the collection name title-cased). */
export function draftEntityLabels(files: Files): string[] {
  try {
    const pack = parse(files["pack.yaml"] ?? "") as { entities?: Record<string, { label?: string }> } | null;
    return Object.entries(pack?.entities ?? {}).map(([name, e]) => (typeof e?.label === "string" && e.label.trim()) || titleCase(name));
  } catch {
    return [];
  }
}

export function agentFromDraft(draft: DraftForAgent, worldId: string): AgentInput {
  const provenance = [draft.client, draft.repo].filter(Boolean).join(" · ");
  return {
    name: draft.input.name.trim(),
    version: "plugin",
    shape: "mcp",
    toolAliases: {},
    notes: `Imported by the worldbuilder plugin${provenance ? ` (${provenance})` : ""}`,
    source: "mcp",
    description: draft.input.description.trim(),
    mandate: draftMandate(draft.files),
    tools: draftTools(draft.files).map((t) => t.name),
    entities: draftEntityLabels(draft.files),
    worldIds: [worldId],
    worlds: [],
  };
}
