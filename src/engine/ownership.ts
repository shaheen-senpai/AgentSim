// Ownership resolution: which principal (customer, tenant, ...) a row belongs to.
//
// Validated at pack-load time (`resolveOwnerChain` in pack.ts) so every entity's `owner.via`
// chain is known to terminate at the principal — but individual rows aren't validated, so a
// dangling ref (a row whose ref field points at a nonexistent row) is a runtime possibility.
// `ownerOf` must be robust to that: return `null`, never throw.
import type { WorldPack } from "./pack";
import type { Row, World } from "./types";

function rowIn(w: World, collection: string, id: string): Row | undefined {
  return (w.collections[collection] ?? []).find((r) => r.id === id);
}

/**
 * Follows `owner.via` refs from `collection`/`id` until an `owner: self` collection is reached,
 * returning that row's id (the principal). `null` for an unknown id, a non-string id, an unknown
 * collection, or a dangling ref anywhere along the chain.
 */
export function ownerOf(pack: WorldPack, w: World, collection: string, id: unknown): string | null {
  if (typeof id !== "string") return null;

  let curCollection = collection;
  let curId = id;
  const limit = Object.keys(pack.meta.entities).length + 1;
  for (let hops = 0; hops <= limit; hops++) {
    const entity = pack.meta.entities[curCollection];
    if (!entity) return null;
    const row = rowIn(w, curCollection, curId);
    if (!row) return null;
    if (entity.owner === "self") return curId;

    const refCollection = entity.fields[entity.owner.via]?.ref;
    if (!refCollection) return null;
    const nextId = row[entity.owner.via];
    if (typeof nextId !== "string") return null;
    curCollection = refCollection;
    curId = nextId;
  }
  return null;
}

/** Which entity a bare id belongs to, by `id_prefix` (longest prefix wins); `null` when none matches. */
export function collectionOfId(pack: WorldPack, id: string): string | null {
  let best: string | null = null;
  let bestLen = -1;
  for (const [name, entity] of Object.entries(pack.meta.entities)) {
    const prefix = entity.id_prefix;
    if (prefix && id.startsWith(prefix) && prefix.length > bestLen) {
      best = name;
      bestLen = prefix.length;
    }
  }
  return best;
}
