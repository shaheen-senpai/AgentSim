import { readFileSync } from "node:fs";
import path from "node:path";
import type { WorldPack } from "@/engine/pack";

/** Ticket 03: the only tested model that exhibits the failure; same model for every version so the prompt is the only variable. */
export const REFERENCE_AGENT_MODEL = "claude-haiku-4-5";

/** The domain-neutral prompt used for any pack that ships none of its own. */
export const GENERIC_VERSION = "generic";

/** The Reference Agent versions a pack offers: its own prompts, or the generic one. */
export function referenceVersions(pack: WorldPack): string[] {
  const own = Object.keys(pack.agents).sort();
  return own.length > 0 ? own : [GENERIC_VERSION];
}

/** A pack's prompt for `version`, falling back to the repo-root `agents/generic.md`. */
export function loadSystemPrompt(pack: WorldPack, version: string): string {
  const own = pack.agents[version];
  if (own !== undefined) return own.trim();
  return readFileSync(path.join(process.cwd(), "agents", `${GENERIC_VERSION}.md`), "utf8").trim();
}
