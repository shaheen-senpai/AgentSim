"use client";
// Run A over every completed Run, Run B over A's same-pack same-Scenario peers, and a swap
// (design/agentsim-console.html 598-602, `renderComparePickers` 1096-1104). Navigation by query
// param, so the Server Component re-renders with the new pair.
import { useRouter } from "next/navigation";
import type { RunSummary } from "@/ui/types";
import { runName, scenarioShortTitle } from "@/ui/format";
import { relativeTime } from "@/ui/relativeTime";

function runLabel(r: RunSummary, now: number): string {
  return `${runName(r.agentLabel, r.attackId)} · ${scenarioShortTitle(r.scenarioTitle)} · ${relativeTime(r.createdAt, now)}`;
}

/** `now` comes from the server so the option labels hydrate identically. */
export function RunPicker({ runs, a, b, now }: { runs: RunSummary[]; a: string; b: string; now: number }) {
  const router = useRouter();
  const completed = runs.filter((r) => r.status === "completed");
  const peersOf = (id: string) => {
    const runA = completed.find((r) => r.id === id);
    return runA ? completed.filter((r) => r.scenarioId === runA.scenarioId && r.packId === runA.packId && r.id !== id) : [];
  };
  const peers = peersOf(a);

  function go(nextA: string, nextB: string) {
    router.push(`/compare?a=${encodeURIComponent(nextA)}&b=${encodeURIComponent(nextB)}`);
  }

  if (completed.length < 2) {
    return <p className="sub">At least two completed Runs are needed to compare — this app has {completed.length} so far.</p>;
  }

  return (
    <div className="cmp-picker">
      <div>
        <span className="field-label">Run A</span>
        <select
          value={a}
          aria-label="Run A"
          onChange={(e) => {
            const nextA = e.target.value;
            go(nextA, peersOf(nextA)[0]?.id ?? "");
          }}
        >
          {completed.map((r) => (
            <option key={r.id} value={r.id}>{runLabel(r, now)}</option>
          ))}
        </select>
      </div>
      <button type="button" className="swap" onClick={() => go(b, a)} disabled={!a || !b} title="Swap" aria-label="Swap Run A and Run B">⇄</button>
      <div>
        <span className="field-label">Run B</span>
        <select value={b} aria-label="Run B" onChange={(e) => go(a, e.target.value)} disabled={peers.length === 0}>
          {peers.length === 0 && <option value="">No other Run of this Scenario yet</option>}
          {peers.map((r) => (
            <option key={r.id} value={r.id}>{runLabel(r, now)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
