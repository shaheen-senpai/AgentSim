import { cpSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/** Copies worldpacks/<ids> into a fresh temp dir and points AGENTSIM_PACKS_DIR at it. Returns the dir. */
export function usePacksDir(...ids: string[]): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), "agentsim-packs-"));
  for (const id of ids.length ? ids : ["northwind"]) cpSync(path.join(process.cwd(), "worldpacks", id), path.join(dir, id), { recursive: true });
  process.env.AGENTSIM_PACKS_DIR = dir;
  return dir;
}
