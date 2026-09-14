import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export type AgentVersion = "naive" | "fixed";
export const AGENT_VERSIONS: AgentVersion[] = ["naive", "fixed"];

/** Ticket 03: the only tested model that exhibits the failure; same model for both versions so the prompt is the only variable. */
export const REFERENCE_AGENT_MODEL = "claude-haiku-4-5";

/**
 * Task 2 moved these prompts to `worldpacks/northwind/agents/` (git mv). The repo-root
 * `agents/` folder is retired along with the rest of `src/sim` in Task 7; until then this
 * falls back to the new location so the old runner keeps working.
 */
export function loadSystemPrompt(version: AgentVersion): string {
  const legacy = path.join(process.cwd(), "agents", `${version}.md`);
  const p = existsSync(legacy) ? legacy : path.join(process.cwd(), "worldpacks", "northwind", "agents", `${version}.md`);
  return readFileSync(p, "utf8").trim();
}
