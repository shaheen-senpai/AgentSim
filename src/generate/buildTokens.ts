// Build tokens: the gate on `/mcp/worlds`, the one unauthenticated route in this app that spends
// money. The console issues a token, the operator passes it to the plugin, and `register_agent`
// makes no model call without a live one — so drafting a World needs console access, not just
// reachability.
//
// A token's life is one World's review cycle:
//
//   issued → claimed for a drafting attempt → bound to the World that attempt created
//          → re-claimed and re-created over that same World, as often as the review needs
//          → rotated when that World is published, which retires it and mints its successor
//
// Three consequences worth stating, because each one is a bug this replaced:
//
//   * A claim that drafts nothing is *released*. A crash on our side must not cost the operator a
//     trip back to the console for a token they never got to use.
//   * A bound token updates exactly one World. It cannot be spent on a second one, so re-running
//     the plugin refines the World under review instead of leaving a trail of `<id>-2`s.
//   * A bound token does not age out. The hour applies to a token that has produced nothing; once
//     a World depends on it, publication is what ends it, however long the review takes.
//
// In memory and `globalThis`-pinned for the same reason as the draft registry: `next dev`
// re-evaluates this module per request. The durable record of a run is the World it produced —
// which carries its token in `built_by` — so nothing here needs to survive a restart.
import { randomBytes } from "node:crypto";

export const TTL_MS = 60 * 60 * 1000; // an hour, as the console promises

/**
 * Drafting attempts one token may make *before* it is bound to a World. More than one so a failed
 * generation costs nothing; bounded so a leaked token that never builds anything cannot be replayed
 * into an unmetered model bill. Once bound, the cap no longer applies: the token can only redraft
 * the one World it already owns.
 */
export const MAX_CLAIMS = 5;

type Entry = {
  issuedAt: number;
  claims: number;
  /** The World this token owns, set by the first `create_world` that succeeds with it. */
  worldId?: string;
  /** When publication retired it. Kept, rather than deleted, so reuse reports what happened. */
  rotatedAt?: number;
};

const g = globalThis as unknown as { __agentsimBuildTokens?: Map<string, Entry> };
const tokens = (g.__agentsimBuildTokens ??= new Map<string, Entry>());

/**
 * Whether an entry has aged out. A token bound to a World never does — publication ends it — but a
 * rotated one ages from the rotation, so its "this was rotated" message does not outlive the
 * session it belongs to.
 */
function expired(e: Entry): boolean {
  if (e.rotatedAt !== undefined) return Date.now() - e.rotatedAt > TTL_MS;
  if (e.worldId !== undefined) return false;
  return Date.now() - e.issuedAt > TTL_MS;
}

export function issueToken(): { token: string; expiresAt: number } {
  for (const [token, e] of tokens) if (expired(e)) tokens.delete(token);
  const token = `wb_${randomBytes(4).toString("hex")}`;
  const issuedAt = Date.now();
  tokens.set(token, { issuedAt, claims: 0 });
  return { token, expiresAt: issuedAt + TTL_MS };
}

export type ClaimResult = "ok" | "unknown" | "expired" | "exhausted" | "published" | "rotated";

/**
 * Takes a token for one drafting attempt. Pair every `ok` with `releaseToken` (the attempt produced
 * nothing) or `bindToken` (it produced a World).
 *
 * `isPublished` is injected because this module holds no filesystem: the caller knows how to read a
 * World's status, and a bound token's validity is exactly "that World is still a draft".
 */
export function claimToken(token: string, isPublished: (worldId: string) => boolean = () => false): ClaimResult {
  const status = tokenStatus(token, isPublished);
  if (status === "expired" || status === "unknown") tokens.delete(token);
  if (status !== "ok") return status;

  // Only an unbound token counts attempts; a bound one is already limited to the World it owns.
  const entry = tokens.get(token);
  if (entry && entry.worldId === undefined) tokens.set(token, { ...entry, claims: entry.claims + 1 });
  return "ok";
}

/**
 * A token's state without taking anything from it — what a caller that is not about to spend a
 * model call asks. `create_world` uses this: it costs nothing, so it enforces only the two rules
 * that are about *ownership* (the token was rotated; the World it owns has gone live) and leaves
 * the hour and the attempt cap to `claimToken`, which is where the money is.
 */
export function tokenStatus(token: string, isPublished: (worldId: string) => boolean = () => false): ClaimResult {
  const entry = tokens.get(token);
  if (!entry) return "unknown";
  if (expired(entry)) return entry.rotatedAt !== undefined ? "unknown" : "expired";
  if (entry.rotatedAt !== undefined) return "rotated";
  if (entry.worldId !== undefined) return isPublished(entry.worldId) ? "published" : "ok";
  if (entry.claims >= MAX_CLAIMS) return "exhausted";
  return "ok";
}

/**
 * Hands a claim back, for an attempt that produced no draft — the operator is left holding a token
 * they can use again. A bound token has nothing to hand back; its World is its record.
 */
export function releaseToken(token: string): void {
  const entry = tokens.get(token);
  if (!entry || entry.worldId !== undefined || entry.rotatedAt !== undefined) return;
  tokens.set(token, { ...entry, claims: Math.max(0, entry.claims - 1) });
}

/** Binds a token to the one World it may go on to update. The first World wins; later ones are ignored. */
export function bindToken(token: string, worldId: string): void {
  const entry = tokens.get(token);
  if (!entry || entry.worldId !== undefined || entry.rotatedAt !== undefined) return;
  tokens.set(token, { ...entry, worldId });
}

/** The World this token owns — what `create_world` updates instead of creating a second one. */
export function boundWorldId(token: string): string | undefined {
  const entry = tokens.get(token);
  if (!entry || expired(entry) || entry.rotatedAt !== undefined) return undefined;
  return entry.worldId;
}

/**
 * Retires a token because the World it owned has been published, and issues its successor.
 *
 * Idempotent: re-saving an already-published World does not mint a second token. Returns `null`
 * when there was nothing to rotate, which is the common case — a World composed in the console
 * carries no token in `built_by` at all.
 */
export function rotateToken(token: string): { token: string; expiresAt: number } | null {
  const entry = tokens.get(token);
  if (!entry || entry.rotatedAt !== undefined) return null;
  const next = issueToken();
  tokens.set(token, { ...entry, rotatedAt: Date.now() });
  return next;
}

/** What to tell an MCP client that could not claim its token. */
export const CLAIM_MESSAGE: Record<Exclude<ClaimResult, "ok">, string> = {
  unknown: "That build token is not one AgentSim issued. Open /worlds/new, choose the worldbuilder plugin, and copy the token it shows.",
  expired: "That build token has expired — an unused one lasts an hour. Open /worlds/new and copy a fresh one.",
  exhausted: `That build token has made ${MAX_CLAIMS} drafting attempts without producing a World. Open /worlds/new for a fresh one.`,
  published: "That build token's World has been published, which ends the token's life. Open /worlds/new for a fresh one.",
  rotated: "That build token was rotated when its World was published — publishing retires the token that built it. Its replacement is shown on that World's page in the console, or open /worlds/new for a fresh one.",
};
