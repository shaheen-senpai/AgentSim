export type { RunRecord, RunSummary, RunAgent, RunStatus } from "@/runner/store";
export type { Event } from "@/sim/types";
export type { Score, DimensionScore, Violation } from "@/sim/evaluator";
export type { DiffEntry } from "@/sim/diff";
export type ScenarioSummary = { id: string; title: string; attacks: { id: string; title: string }[] };
