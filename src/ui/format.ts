// Generic, pack-aware event formatting for the Timeline (and, later, Flow nodes): driven by a
// tool's declared shape (`input` field types, `op`, `collection`, `set`) rather than any tool's
// name — a pack with entirely different tools formats exactly the same way.
import { fmtMoney } from "@/engine/money";
import type { Outcome, Score } from "@/engine/evaluator";
import type { ToolDef } from "@/engine/pack";
import type { Event } from "./types";

// Only used when no ToolDef is available to ask what's `text`; kept narrow on purpose.
const LEGACY_TEXT_NAMES = new Set(["reason", "note", "body"]);

function isTextField(key: string, tool?: ToolDef): boolean {
  return tool ? tool.input[key]?.type === "text" : LEGACY_TEXT_NAMES.has(key);
}

function fmtValue(key: string, v: unknown): string {
  return key === "amount" ? fmtMoney(Number(v)) : String(v);
}

/** `key: value` pairs from a tool call's arguments, dropping any the tool declares `type: "text"`. */
export function fmtArgs(input: Record<string, unknown>, tool?: ToolDef): string {
  return Object.entries(input)
    .filter(([k]) => !isTextField(k, tool))
    .map(([k, v]) => `${k}: ${fmtValue(k, v)}`)
    .join(" · ");
}

/** Singular, capitalised form of a collection name — "tickets" → "Ticket" — for a generic result label. */
function labelFor(collection: string): string {
  const singular = collection.endsWith("s") ? collection.slice(0, -1) : collection;
  return singular.length ? singular[0].toUpperCase() + singular.slice(1) : singular;
}

/** A row's own `id`, or (for a `create` tool whose `returns` is a custom shape) a `<singular collection>_id` field. */
function idOf(collection: string, row: Record<string, unknown>): string | undefined {
  if (typeof row.id === "string") return row.id;
  const key = `${collection.endsWith("s") ? collection.slice(0, -1) : collection}_id`;
  return typeof row[key] === "string" ? (row[key] as string) : undefined;
}

function isScalar(v: unknown): v is string | number | boolean {
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * A one-line summary of an Event's result, shaped by its tool's declared `op` — never by the
 * tool's name. Unparseable JSON, or a shape the op-specific branch can't make sense of, falls back
 * to a truncated slice of the raw result so nothing is ever silently blank.
 */
export function summarizeResult(tool: ToolDef | undefined, ev: Event): string {
  if (ev.error) return `✗ ${ev.error}`;
  if (!ev.result) return "";

  const fallback = () => ev.result!.slice(0, 80);

  let parsed: unknown;
  try {
    parsed = JSON.parse(ev.result);
  } catch {
    return fallback();
  }
  if (!tool) return fallback();

  if (tool.op === "list") {
    if (!Array.isArray(parsed)) return fallback();
    return `${parsed.length} row${parsed.length === 1 ? "" : "s"}`;
  }

  if (typeof parsed !== "object" || parsed === null) return fallback();
  const row = parsed as Record<string, unknown>;

  if (tool.op === "get") {
    const id = idOf(tool.collection, row);
    if (!id) return fallback();
    const extra = Object.entries(row)
      .filter(([k, v]) => k !== "id" && isScalar(v))
      .slice(0, 2)
      .map(([k, v]) => `${k}: ${fmtValue(k, v)}`);
    return [`${labelFor(tool.collection)} ${id}`, ...extra].join(" · ");
  }

  if (tool.op === "create") {
    const id = idOf(tool.collection, row);
    return id ? `→ ${id}` : fallback();
  }

  // update
  const field = Object.keys(tool.set ?? {})[0];
  if (!field || !(field in row) || !isScalar(row[field])) return fallback();
  return `→ ${field} = ${fmtValue(field, row[field])}`;
}

export function elapsedLabel(events: Event[], i: number): string {
  const prev = i === 0 ? events[0].at : events[i - 1].at;
  return `${((events[i].at - prev) / 1000).toFixed(1)}s`;
}

/**
 * A tool result re-indented for reading (the Event drawer's *Details* tab). A result is normally
 * `JSON.stringify`d by the DSL, but a BYO agent can return anything, so anything that does not
 * parse comes back untouched rather than being swallowed.
 */
export function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * `HH:MM:SS.mmm` of a wall-clock ms timestamp, in UTC — deliberately not the viewer's locale or
 * zone, so the same Run reads the same on every machine (and server and client agree).
 */
export function clockTime(ms: number): string {
  return new Date(ms).toISOString().slice(11, 23);
}

/**
 * `YYYY-MM-DD HH:MM` of an ISO timestamp, in UTC — deliberately not the viewer's locale or zone,
 * for the same reason `clockTime` isn't: server and client must agree, or hydration mismatches.
 */
export function runDate(iso: string): string {
  return new Date(iso).toISOString().slice(0, 16).replace("T", " ");
}

/**
 * The sentence under the headline number. It reads the Scenario's bar first and the Outcome second,
 * in the same order as `runVerdict` on the Runs list, so the two surfaces can never disagree about
 * whether a Run passed. Before the Outcome existed, every uncapped Run claimed a completed happy
 * path here — including one that refused, and one that died on its first call.
 */
export function scoreSummary(score: Score): string {
  const mean = Math.round(score.dimensions.reduce((sum, d) => sum + d.score, 0) / score.dimensions.length);
  const cleanSentence = "No Violations. Happy path completed within authority.";
  // A capped Run can never pass, so the cap is read before anything the Scenario declared.
  if (score.capped) return `Mean ${mean} → capped at ${score.headline}: ${score.capReason}.`;
  const cleared = (sentence: string) => (score.passed ? `${sentence} Within this Scenario's thresholds.` : sentence);

  switch (score.outcome) {
    case "completed":
      return cleanSentence;
    case "violated":
      return score.passed
        ? `Mean ${mean}. Violations, but every Dimension meets this Scenario's threshold.`
        : `Mean ${mean}. ${score.passReason}.`;
    case "incomplete":
    case "refused":
      return cleared(`The agent ${score.outcomeReason}.`);
    case "abandoned":
      return cleared(`Not a refusal: ${score.outcomeReason}.`);
    default:
      // Only a Run recorded before the Outcome existed, whose stored Score has no `outcome` at all.
      // Every known Outcome is named above precisely so this branch cannot quietly absorb a new
      // one and call it a happy path.
      return cleanSentence;
  }
}

/**
 * The badge beside a headline for an Outcome that is not a plain completion, or null for one that
 * needs none. One definition, because this rule previously lived inline on three surfaces and a new
 * Outcome was silently missed by one of them — a compiler cannot catch a missing `||` arm.
 */
export function outcomeBadge(outcome: Outcome | null): string | null {
  switch (outcome) {
    case "incomplete": return "Incomplete";
    case "refused": return "Refused";
    case "abandoned": return "Abandoned";
    // `violated` needs none: the cap badge or the summary sentence already says so.
    default: return null;
  }
}
