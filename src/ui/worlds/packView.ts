// Pure view-model helpers for the Worlds pages (spec §6.2): tab parsing, seed truncation, and the
// one-line summaries the Tools and Scenarios cards print. No React, no DOM, no filesystem — the
// components under `src/ui/worlds/` are thin renderers over these, and `tests/ui/packView.test.ts`
// covers the logic without a DOM environment.
import { label as dimensionLabel, DIMENSIONS, type Dimension } from "@/engine/dimensions";
import type { Check, FieldSpec, Mutation, Lure, PackMeta, ToolDef } from "@/engine/pack";
import type { PackSummary } from "@/lib/summaries";

export const WORLD_TABS = ["overview", "seed", "tools", "scenarios", "agents"] as const;
export type WorldTab = (typeof WORLD_TABS)[number];

const TAB_LABELS: Record<WorldTab, string> = {
  overview: "Overview",
  seed: "Seed",
  tools: "Tools",
  scenarios: "Scenarios",
  agents: "Agents",
};

export const tabLabel = (t: WorldTab): string => TAB_LABELS[t];

/** `?tab=` → a known tab. Anything unknown, repeated or absent falls back to Overview. */
export function parseTab(raw: string | string[] | undefined): WorldTab {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (WORLD_TABS as readonly string[]).includes(value ?? "") ? (value as WorldTab) : "overview";
}

/** How many seed rows a table shows before it says "n of m". */
export const SEED_ROW_LIMIT = 50;
/** How much of a `text` field a seed cell shows before the rest moves into its `title`. */
export const TEXT_MAX = 80;

/** `s` clipped to `max` characters with a trailing ellipsis; `truncated` says whether it was clipped. */
export function truncate(s: string, max: number = TEXT_MAX): { text: string; truncated: boolean } {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length <= max ? { text: flat, truncated: false } : { text: `${flat.slice(0, max)}…`, truncated: true };
}

export type RowPreview<T> = { shown: T[]; total: number; truncated: boolean; caption: string };

/** The first `limit` rows of a collection, with the caption the table's `<caption>` prints. */
export function previewRows<T>(rows: T[], limit: number = SEED_ROW_LIMIT): RowPreview<T> {
  const total = rows.length;
  const truncated = total > limit;
  return {
    shown: truncated ? rows.slice(0, limit) : rows,
    total,
    truncated,
    caption: truncated ? `${limit} of ${total} rows` : `${total} ${total === 1 ? "row" : "rows"}`,
  };
}

/** One seed cell as text. `text` fields are clipped; the untouched value rides along for `title`. */
export function cellText(value: unknown, spec?: FieldSpec): { text: string; title: string | null } {
  if (value === undefined || value === null) return { text: "—", title: null };
  const raw = Array.isArray(value)
    ? value.map((v) => (typeof v === "object" && v !== null ? JSON.stringify(v) : String(v))).join(", ")
    : typeof value === "object"
      ? JSON.stringify(value)
      : String(value);
  if (raw === "") return { text: "—", title: null };
  if (spec?.type !== "text") return { text: raw, title: raw.length > TEXT_MAX ? raw : null };
  const { text, truncated } = truncate(raw);
  return { text, title: truncated ? raw : null };
}

/** The pack card's counts line. */
export function countsLabel(s: PackSummary): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  return [plural(s.collections, "collection"), plural(s.rows, "row"), plural(s.tools, "tool"), plural(s.scenarios, "scenario")].join(" · ");
}

export type SystemCount = { system: string; label: string; tools: number };

/** Every declared System with how many tools it owns, in the pack's declaration order. */
export function systemCounts(meta: PackMeta, tools: Record<string, ToolDef>): SystemCount[] {
  const counts = new Map<string, number>();
  for (const t of Object.values(tools)) counts.set(t.system, (counts.get(t.system) ?? 0) + 1);
  return Object.entries(meta.systems).map(([system, { label }]) => ({ system, label, tools: counts.get(system) ?? 0 }));
}

export type DimensionGroup = { dimension: Dimension; label: string; checks: Check[] };

/** A Scenario's Checks grouped by Dimension, in the canonical Dimension order; empty groups dropped. */
export function checksByDimension(checks: Check[]): DimensionGroup[] {
  return DIMENSIONS.map((dimension) => ({
    dimension,
    label: dimensionLabel(dimension),
    checks: checks.filter((c) => c.dimension === dimension),
  })).filter((g) => g.checks.length > 0);
}

function scalar(v: unknown): string {
  return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
}

/** A Check's parameters (everything but `type` and `dimension`) as one line. */
export function checkParams(check: Check): string {
  return Object.entries(check as Record<string, unknown>)
    .filter(([k]) => k !== "type" && k !== "dimension")
    .map(([k, v]) => `${k}: ${scalar(v)}`)
    .join(" · ");
}

/** What an Attack's mutation does to the seeded World, in one line. */
export function mutationSummary(m: Mutation): string {
  switch (m.type) {
    case "append_to_field":
      return `append to ${m.collection}/${m.id}.${m.field}`;
    case "set_field":
      return `set ${m.collection}/${m.id}.${m.field} = ${scalar(m.value)}`;
    case "insert_row":
      return `insert row ${m.row.id} into ${m.collection}`;
  }
}

/** The text an Attack's mutation writes into the World — what the Lure is baited with. */
export function mutationText(m: Mutation): string | null {
  if (m.type === "append_to_field") return m.text;
  if (m.type === "set_field") return typeof m.value === "string" ? m.value : JSON.stringify(m.value);
  return JSON.stringify(m.row, null, 2);
}

/** The call that counts as taking the Lure. */
export function lureSummary(l: Lure): string {
  const args = Object.entries(l.args_match).map(([k, v]) => `${k} = ${scalar(v)}`).join(", ");
  return args ? `${l.tool} with ${args}` : l.tool;
}

/** A tool's `op collection` line — `list orders`, `update tickets`. */
export const opLabel = (t: ToolDef): string => `${t.op} ${t.collection}`;

/** A tool input field as `name: type` (enums spell out their values). */
export function fieldLabel(name: string, spec: FieldSpec): string {
  const type = spec.type === "enum" ? `enum(${(spec.values ?? []).join(" | ")})` : spec.type;
  return `${name}: ${type}${spec.optional ? "?" : ""}`;
}

/** The link that opens the Launcher with this pack and Scenario already chosen. */
export const runHref = (packId: string, scenarioId: string): string =>
  `/runs/new?packId=${encodeURIComponent(packId)}&scenarioId=${encodeURIComponent(scenarioId)}`;

/** The link to a World's detail page on a given tab (Overview is the bare URL). */
export const tabHref = (packId: string, tab: WorldTab): string =>
  tab === "overview" ? `/worlds/${packId}` : `/worlds/${packId}?tab=${tab}`;
