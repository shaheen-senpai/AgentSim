import { readFileSync } from "node:fs";
import path from "node:path";

export type AgentVersion = "naive" | "fixed";
export const AGENT_VERSIONS: AgentVersion[] = ["naive", "fixed"];

/** Ticket 03: the only tested model that exhibits the failure; same model for both versions so the prompt is the only variable. */
export const REFERENCE_AGENT_MODEL = "claude-haiku-4-5";

export function loadSystemPrompt(version: AgentVersion): string {
  return readFileSync(path.join(process.cwd(), "agents", `${version}.md`), "utf8").trim();
}
