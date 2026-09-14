export type { RunRecord, RunSummary, RunAgentRef, RunStatus, AgentShape, FinishedBy } from "@/runner/store";
export type { Change, Event } from "@/engine/types";
export type { Score, DimensionScore, Violation } from "@/engine/evaluator";
export type { DiffEntry } from "@/engine/diff";
export type ScenarioSummary = { id: string; title: string; attacks: { id: string; title: string }[] };
