"use client";
// Two Run selects + a swap button, driving query-param navigation — the same pattern every other
// picker in this app uses (World tabs' `?tab=`, the wizard's steps): the Server Component re-renders
// with the new pair, no client-side Run fetching.
import { useRouter } from "next/navigation";
import type { RunSummary } from "@/ui/types";
import { field, focusRing, label as labelClass } from "@/ui/styles";

function runLabel(r: RunSummary): string {
  return `${r.agentLabel} · ${r.id.slice(0, 12)}`;
}

export function RunPicker({ runs, a, b }: { runs: RunSummary[]; a: string; b: string }) {
  const router = useRouter();
  const completed = runs.filter((r) => r.status === "completed");
  const peersOf = (id: string) => {
    const runA = completed.find((r) => r.id === id);
    return runA ? completed.filter((r) => r.scenarioId === runA.scenarioId && r.id !== id) : [];
  };
  const peers = peersOf(a);

  function go(nextA: string, nextB: string) {
    router.push(`/compare?a=${encodeURIComponent(nextA)}&b=${encodeURIComponent(nextB)}`);
  }

  if (completed.length < 2) {
    return <p className="text-[13px] text-[#6E6B60]">At least two completed Runs are needed to compare — this app has {completed.length} so far.</p>;
  }

  return (
    <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-end max-w-[720px]">
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Run A</span>
        <select
          value={a}
          onChange={(e) => {
            const nextA = e.target.value;
            const nextPeers = peersOf(nextA);
            go(nextA, nextPeers[0]?.id ?? "");
          }}
          className={field}
        >
          {completed.map((r) => (
            <option key={r.id} value={r.id}>
              {runLabel(r)}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={() => go(b, a)}
        disabled={!a || !b}
        title="Swap"
        aria-label="Swap Run A and Run B"
        className={`h-9 w-9 rounded-lg border border-[#E3E0D5] bg-white text-[14px] disabled:opacity-40 ${focusRing}`}
      >
        ⇄
      </button>
      <div className="flex flex-col gap-1">
        <span className={labelClass}>Run B</span>
        <select value={b} onChange={(e) => go(a, e.target.value)} className={field} disabled={peers.length === 0}>
          {peers.length === 0 && <option value="">No other Run of this Scenario yet</option>}
          {peers.map((r) => (
            <option key={r.id} value={r.id}>
              {runLabel(r)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
