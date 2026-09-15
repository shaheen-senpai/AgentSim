export type { RunRecord, RunSummary, RunAgentRef, RunStatus, AgentShape, FinishedBy } from "@/runner/store";
export type { Change, Event } from "@/engine/types";
export type { Score, DimensionScore, Violation } from "@/engine/evaluator";
export type { DiffEntry } from "@/engine/diff";
export type { ScenarioSummary, PackSummary, PackOption } from "@/lib/summaries";
// Type-only: erased at compile time, so this never pulls `engine/pack`'s `node:fs` use into a
// client bundle. Server pages load the real ToolDef data and pass it down as plain, serialisable props.
export type { ToolDef } from "@/engine/pack";
