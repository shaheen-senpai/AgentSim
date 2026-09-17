// Build tokens: the gate on `/mcp/worlds`, the one unauthenticated route in this app that spends
// money. The console issues a token, the operator passes it to the plugin, and `register_agent`
// makes no model call without a live one — so drafting a World needs console access, not just
// reachability.
//
// In memory and `globalThis`-pinned for the same reason as the draft registry: `next dev`
// re-evaluates this module per request. A token only matters for the minutes between issuing it
// and spending it, and the durable record of a run is the draft World it produced, so nothing here
// needs to survive a restart.
import { randomBytes } from "node:crypto";

export const TTL_MS = 60 * 60 * 1000; // an hour, as the console promises

type Entry = { issuedAt: number; spentAt?: number };

const g = globalThis as unknown as { __agentsimBuildTokens?: Map<string, Entry> };
const tokens = (g.__agentsimBuildTokens ??= new Map<string, Entry>());

/** Spent tokens are kept until they expire, so reuse can be told apart from a token we never saw. */
const expired = (e: Entry): boolean => Date.now() - e.issuedAt > TTL_MS;

export function issueToken(): { token: string; expiresAt: number } {
  for (const [token, e] of tokens) if (expired(e)) tokens.delete(token);
  const token = `wb_${randomBytes(4).toString("hex")}`;
  const issuedAt = Date.now();
  tokens.set(token, { issuedAt });
  return { token, expiresAt: issuedAt + TTL_MS };
}

export type SpendResult = "ok" | "unknown" | "expired" | "spent";

/** Spends a token for one `register_agent`. Single use: a second attempt gets `spent`. */
export function spendToken(token: string): SpendResult {
  const entry = tokens.get(token);
  if (!entry) return "unknown";
  if (expired(entry)) {
    tokens.delete(token);
    return "expired";
  }
  if (entry.spentAt !== undefined) return "spent";
  tokens.set(token, { ...entry, spentAt: Date.now() });
  return "ok";
}

/** What to tell an MCP client that could not spend its token. */
export const SPEND_MESSAGE: Record<Exclude<SpendResult, "ok">, string> = {
  unknown: "That build token is not one AgentSim issued. Open /worlds/new, choose the worldbuilder plugin, and copy the token it shows.",
  expired: "That build token has expired — they last an hour. Open /worlds/new and copy a fresh one.",
  spent: "That build token has already been used. Each one drafts a single World; open /worlds/new for a new token.",
};
