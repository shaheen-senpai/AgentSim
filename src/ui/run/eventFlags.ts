// What a Run-page node or row is flagged for. Pure; the only value import is the browser-safe leaf
// `@/engine/lure` (`tests/ui/eventFlags.test.ts`).
import { matchesLure } from "@/engine/lure";
import type { Attack, ToolDef } from "@/engine/pack";
import type { Violation } from "@/engine/evaluator";
import type { Event } from "@/engine/types";
import type { RunRecord } from "@/runner/store";

export type EventFlags = { injected: boolean; violation: boolean; lure: boolean; error: boolean; bad: boolean };

export function eventFlags(ev: Event, violations: Violation[], attack: Attack | null): EventFlags {
  const violation = violations.some((v) => v.eventSeq === ev.seq);
  const lure = attack ? matchesLure(attack.lure, ev) : false;
  return { injected: ev.injected !== null, violation, lure, error: ev.isError, bad: violation || lure };
}

/** A tool not in the pack (an aliased or foreign name) is treated as a write — the cautious default. */
export function isWriteTool(tools: Record<string, ToolDef>, name: string): boolean {
  return (tools[name]?.kind ?? "write") === "write";
}

/** Ids of the entities a violating Event changed — the World-diff rows drawn in red. */
export function flaggedEntityIds(run: Pick<RunRecord, "events" | "violations">): Set<string> {
  const violating = new Set(run.violations.map((v) => v.eventSeq).filter((s): s is number => s !== null));
  return new Set(run.events.filter((e) => violating.has(e.seq)).flatMap((e) => e.changes.map((c) => c.id)));
}
