import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { Event, Seed } from "@/sim/types";

/** Raw parse of the committed Seed — Task 7 adds the validated loader. */
export function northwind(): Seed {
  return parse(readFileSync("seeds/northwind.yaml", "utf8")) as Seed;
}

/** Build an Event for Evaluator tests without running a tool. */
export function ev(seq: number, tool: string, input: Record<string, unknown>, isError = false): Event {
  return { seq, at: 1_700_000_000_000 + seq * 100, toolUseId: `tu_${seq}`, tool, input, isError, changes: [] };
}
