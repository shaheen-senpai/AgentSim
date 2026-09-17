// Installed packs as the composer's tiles show them. Server-only callers pass `loadPacks().packs`.
import type { WorldPack } from "@/engine/pack";
import type { PackPick } from "./composeModel";

export function toPackPicks(packs: WorldPack[]): PackPick[] {
  return packs.map((p) => ({
    id: p.meta.id,
    name: p.meta.name,
    domain: p.meta.domain,
    description: p.meta.description,
    entities: Object.keys(p.meta.entities).length,
    tools: Object.keys(p.tools).length,
  }));
}
