import { cpSync, existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where the packs the tests run against live. Deliberately **not** `worldpacks/`: that directory is
 * a developer's own sandbox and its contents are gitignored, so each person starts with an empty
 * one. Reading it here made the whole suite depend on whatever Worlds happened to be on the machine
 * — 28 test files, silently red on a fresh clone and red again the moment someone discarded a World
 * from the console.
 */
export const FIXTURE_PACKS = path.join(process.cwd(), "tests", "fixtures", "worldpacks");

/** Copies the named fixture packs into a fresh temp dir and points AGENTSIM_PACKS_DIR at it. */
export function copyFixturePacks(...ids: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentsim-packs-"));
  for (const id of ids.length ? ids : ["northwind"]) {
    const from = path.join(FIXTURE_PACKS, id);
    if (!existsSync(from)) throw new Error(`No fixture pack '${id}' under tests/fixtures/worldpacks/`);
    cpSync(from, path.join(dir, id), { recursive: true });
  }
  process.env.AGENTSIM_PACKS_DIR = dir;
  return dir;
}
