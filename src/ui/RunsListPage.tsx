"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PackOption, RunSummary } from "./types";
import { runDate } from "./format";
import { dangerPill, heading, mono, panel, primaryButton, serif } from "./styles";
import type { Dimension } from "@/engine/dimensions";
// Re-exported so existing imports of `latestComparablePair` from this module keep working. The
// function itself now lives in a plain (non-"use client") module — see that file's header comment
// for why: a Server Component (`src/app/compare/page.tsx`) needs to call it during render, and
// Next's server/client boundary forbids calling a function whose defining module is a Client
// Component, even if that's the only reason this file would need "use client" for the function.
export { latestComparablePair } from "./compare/latestComparablePair";
import { latestComparablePair } from "./compare/latestComparablePair";

function dim(r: RunSummary, name: Dimension): number | null {
  return r.dimensions.find((d) => d.name === name)?.score ?? null;
}

function packName(packs: PackOption[], packId: string): string {
  return packs.find((p) => p.id === packId)?.name ?? packId;
}

function scenarioTitle(packs: PackOption[], packId: string, scenarioId: string): string {
  return packs.find((p) => p.id === packId)?.scenarios.find((s) => s.id === scenarioId)?.title ?? scenarioId;
}

function Num({ value }: { value: number | null }) {
  if (value === null) return <span className={`${mono} text-[#6E6B60]`}>—</span>;
  return <span className={`${mono} ${value < 100 ? "text-[#B23A22] font-bold" : ""}`}>{value}</span>;
}

function InsightCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className={`${panel} p-4 flex flex-col gap-1 flex-1 min-w-[200px]`}>
      <div className={heading}>{label}</div>
      <div className={`${serif} text-[26px] font-medium leading-none`}>{value}</div>
      <div className="text-[12px] text-[#6E6B60]">{detail}</div>
    </div>
  );
}

export function RunsListPage({ runs, packs }: { runs: RunSummary[]; packs: PackOption[] }) {
  const failed = runs.filter((r) => r.capped).length;
  const running = runs.filter((r) => r.status === "running").length;
  const attacked = runs.filter((r) => r.attackId !== null);
  const attackSucceeded = attacked.filter((r) => r.capped).length;
  const pair = latestComparablePair(runs);
  const router = useRouter();

  return (
    <div className="p-8 flex flex-col gap-5">
      <div>
        <div className={heading}>AgentSim</div>
        <h1 className={`${serif} text-[34px] font-medium tracking-tight`}>Runs</h1>
        <p className="text-[13px] text-[#6E6B60] mt-1">
          {runs.length} run{runs.length === 1 ? "" : "s"}
          {failed > 0 ? `. ${failed} failed its Mandate.` : "."}
        </p>
      </div>

      <div className="flex gap-4 flex-wrap">
        <InsightCard label="Runs" value={String(runs.length)} detail={running > 0 ? `${running} running, ${failed} capped` : `${failed} capped`} />
        <InsightCard
          label="Under attack"
          value={String(attacked.length)}
          detail={attacked.length > 0 ? `${attackSucceeded} of ${attacked.length} broke the Mandate` : "no attacked runs yet"}
        />
        {pair && (
          <Link href={`/compare?a=${pair.a.id}&b=${pair.b.id}`} className={`${panel} p-4 flex flex-col gap-1 flex-1 min-w-[200px] hover:bg-black/[.02]`}>
            <div className={heading}>Compare</div>
            <div className={`${serif} text-[18px] font-medium leading-tight truncate`}>{scenarioTitle(packs, pair.a.packId, pair.a.scenarioId)}</div>
            <div className="text-[12px] text-[#6E6B60]">{pair.a.agentLabel} vs {pair.b.agentLabel} →</div>
          </Link>
        )}
      </div>

      <div className="flex justify-end">
        <Link href="/runs/new" className={primaryButton}>+ New run</Link>
      </div>

      <div className={`${panel} overflow-x-auto`}>
        <table className="w-full border-collapse min-w-[760px]">
          <thead>
            <tr>
              {["Run", "Scenario", "Attack", "Agent", "Task", "Mandate", "Safety", "Data", "World", "Verdict", "When"].map((h) => (
                <th key={h} scope="col" className={`${heading} text-left px-3.5 py-3 border-b border-[#E3E0D5]`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id} onClick={() => router.push(`/runs/${r.id}`)} className="hover:bg-black/[.02] cursor-pointer">
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]">
                  <Link href={`/runs/${r.id}`} className="block">
                    <div className="font-semibold text-[13px]">{scenarioTitle(packs, r.packId, r.scenarioId)}</div>
                    <div className={`${mono} text-[11px] text-[#6E6B60]`}>{r.id}</div>
                  </Link>
                </td>
                <td className={`${mono} text-[12px] px-3.5 py-3 border-b border-[#E3E0D5]`}>{r.scenarioId}</td>
                <td className={`${mono} text-[12px] text-[#6E6B60] px-3.5 py-3 border-b border-[#E3E0D5]`}>{r.attackId ?? "—"}</td>
                <td className="text-[13px] px-3.5 py-3 border-b border-[#E3E0D5]">{r.agentLabel}</td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "task_completion")} /></td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "policy_compliance")} /></td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "safety")} /></td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]"><Num value={dim(r, "data_access")} /></td>
                <td className="text-[13px] px-3.5 py-3 border-b border-[#E3E0D5]">{packName(packs, r.packId)}</td>
                <td className="px-3.5 py-3 border-b border-[#E3E0D5]">
                  {r.status === "running" ? (
                    <span className="text-[11px] text-[#6E6B60]">running…</span>
                  ) : r.status === "failed" ? (
                    <span className={`px-2 py-0.5 text-[11px] font-bold uppercase ${dangerPill}`}>Error</span>
                  ) : r.capped ? (
                    <span className={`px-2 py-0.5 text-[11px] font-bold uppercase ${dangerPill}`}>Capped</span>
                  ) : (
                    <span className="px-2 py-0.5 text-[11px] font-bold uppercase rounded-full bg-[#E7F4EA] text-[#1E7A43]">Pass</span>
                  )}
                </td>
                <td className="text-[12px] text-[#6E6B60] px-3.5 py-3 border-b border-[#E3E0D5]">{runDate(r.createdAt)}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr><td colSpan={11} className="px-3.5 py-8 text-center text-[13px] text-[#6E6B60]">No runs yet — start one to see it here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
