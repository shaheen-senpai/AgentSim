// A worldbuilder draft as the World list and the New world page show it: who it is for, whether
// it validates, and how much it declares. Server-only (reads the in-memory registry's shape).
import { parse } from "yaml";
import type { Draft } from "@/generate/draftRegistry";

export type DraftSummary = { id: string; createdAt: number; name: string; domain: string; valid: boolean; errorCount: number; tools: number; entities: number };

/** Top-level keys of a YAML mapping (or of `path` inside it); 0 for anything that does not parse. */
function keysOf(text: string | undefined, path?: string): number {
  try {
    const doc = parse(text ?? "") as Record<string, unknown> | null;
    const node = path ? (doc?.[path] as Record<string, unknown> | undefined) : doc;
    return node && typeof node === "object" ? Object.keys(node).length : 0;
  } catch {
    return 0;
  }
}

export function summarizeDraft(d: Draft): DraftSummary {
  return {
    id: d.id,
    createdAt: d.createdAt,
    name: d.input.name,
    domain: d.input.domain,
    valid: d.errors.length === 0,
    errorCount: d.errors.length,
    tools: keysOf(d.files["tools.yaml"]),
    entities: keysOf(d.files["pack.yaml"], "entities"),
  };
}
