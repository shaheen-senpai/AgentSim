// What the Tools tab's schema pane says about a tool, derived from its `ToolDef` and the pack's
// Scenarios: "enforced" guards the tool refuses itself, "graded" guards a Check catches afterwards
// (the mock's whole point), and the untrusted fields a read tool returns. Pure and browser-safe —
// type-only engine imports; `tests/ui/toolPane.test.ts`.
import { stringify } from "yaml";
import type { EntitySpec, Scenario, ToolDef } from "@/engine/pack";

export type ToolInputRow = { name: string; type: string; required: boolean; notes: string };

export function inputRows(tool: ToolDef): ToolInputRow[] {
  return Object.entries(tool.input).map(([name, f]) => {
    const notes: string[] = [];
    if (f.type === "enum") notes.push((f.values ?? []).join(" · "));
    if (f.min !== undefined) notes.push(`min ${f.min}`);
    if (f.max !== undefined) notes.push(`max ${f.max}`);
    if (f.ref) notes.push(`→ ${f.ref}`);
    return { name, type: f.type, required: !f.optional, notes: notes.length > 0 ? notes.join(" · ") : "—" };
  });
}

/** The declared `returns` template as YAML, or the row(s) the op hands back. */
export function outputLabel(tool: ToolDef, entities: Record<string, EntitySpec>): string {
  if (tool.returns !== undefined) return stringify(tool.returns).trimEnd();
  const label = entities[tool.collection]?.label ?? tool.collection;
  return tool.op === "list" ? `${label} rows` : `${label} row`;
}

export type GuardRow = { kind: "enforced" | "graded" | "untrusted"; text: string };

export function guardRows(tool: ToolDef, entities: Record<string, EntitySpec>, scenarios: Scenario[]): GuardRow[] {
  const rows: GuardRow[] = (tool.guards ?? []).map((g) => ({ kind: "enforced", text: `${g.when} — ${g.error}` }));

  for (const s of scenarios) {
    for (const c of s.checks) {
      const d = c.dimension;
      switch (c.type) {
        case "arg_lte":
          if (c.tool === tool.name) rows.push({ kind: "graded", text: `arg_lte — every call must keep ${c.arg} ≤ ${c.max} (${d}).` });
          break;
        case "arg_sum_lte":
          if (c.tools.includes(tool.name)) rows.push({ kind: "graded", text: `arg_sum_lte — ${c.arg} summed over ${c.tools.join(", ")} must stay ≤ ${c.max} (${d}).` });
          break;
        case "arg_in":
          if (c.tool === tool.name) rows.push({ kind: "graded", text: `arg_in — ${c.arg} must be one of ${c.values.map(String).join(", ")} (${d}).` });
          break;
        case "owner_is":
          if (c.tool === tool.name) rows.push({ kind: "graded", text: `owner_is — the subject must resolve to ${c.principal} (${d}).` });
          break;
        case "tool_not_called":
          if (c.tool === tool.name) rows.push({ kind: "graded", text: `tool_not_called — any call at all fails the Check outright (${d}).` });
          break;
        case "reads_scoped":
          // Names no tool: every read is recorded against the principal's ownership chain.
          if (tool.kind === "read") rows.push({ kind: "graded", text: `reads_scoped — recorded; a read outside ${c.principal}'s chain is a Data Access failure, not a tool error (${d}).` });
          break;
      }
    }
  }

  if (tool.kind === "read") {
    const collections = [tool.collection, ...Object.values(tool.include ?? {}).map((i) => i.collection)];
    for (const col of collections) {
      const field = Object.entries(entities[col]?.fields ?? {}).find(([, f]) => f.untrusted)?.[0];
      if (field) {
        rows.push({ kind: "untrusted", text: `Returns ${col}.${field} verbatim — text other people wrote. Under an Attack the planted text arrives through this call.` });
        break;
      }
    }
  }
  return rows;
}
