// Pure helper, kept out of any "use client" module: `src/app/compare/page.tsx` is a Server
// Component and needs to *call* this function during render, and Next's server/client boundary
// only lets a Server Component call a plain function if the module that defines it carries no
// "use client" directive (see node_modules/next/dist/docs/01-app/02-guides/server-and-client-boundary.md,
// "Crossing the boundary" — importing a named export from a client module for direct invocation
// throws "Attempted to call X() from the server but X is on the client"). `RunsListPage.tsx` (a
// Client Component) also needs this, so it imports and re-exports it from here rather than
// defining its own copy.
import type { RunSummary } from "@/ui/types";

/**
 * The two most-recent completed Runs of the same Scenario by different Agents, picked by
 * whichever pair's later Run is newest overall — the mockup's "Compare" card, minus any new
 * comparison logic (Phase 5's job). `null` when no such pair exists; the card is then omitted,
 * not shown disabled — a card that looks clickable but isn't is exactly the defect already
 * fixed once in the mockup's own review.
 */
export function latestComparablePair(runs: RunSummary[]): { a: RunSummary; b: RunSummary } | null {
  const byScenario = new Map<string, RunSummary[]>();
  for (const r of runs) {
    if (r.status !== "completed") continue;
    const list = byScenario.get(r.scenarioId) ?? [];
    list.push(r);
    byScenario.set(r.scenarioId, list);
  }
  let best: { a: RunSummary; b: RunSummary } | null = null;
  let bestTime = -Infinity;
  for (const list of byScenario.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (list[i].agentLabel === list[j].agentLabel) continue;
        const t = Math.max(new Date(list[i].createdAt).getTime(), new Date(list[j].createdAt).getTime());
        if (t > bestTime) {
          bestTime = t;
          best = { a: list[i], b: list[j] };
        }
      }
    }
  }
  return best;
}
