"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RunRecord } from "./types";
import { heading, mono, panel } from "./styles";

export function ConnectAgent({ run }: { run: RunRecord | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const isByo = run?.agent === "byo" && run.status === "running";

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: run?.scenarioId ?? "duplicate-charge-refund", agent: "byo", attackId: run?.attack?.id ?? null }) });
      const { id } = (await res.json()) as { id: string };
      router.push(`/runs/${id}`);
    } finally { setBusy(false); }
  }
  async function finish() {
    if (!run) return;
    setBusy(true);
    try { await fetch(`/api/runs/${run.id}/finish`, { method: "POST" }); router.refresh(); } finally { setBusy(false); }
  }

  return (
    <section className={`${panel} p-4 flex flex-col gap-2 text-xs`}>
      <div className={heading}>Connect your agent</div>
      {isByo ? (
        <>
          <code className={`${mono} bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 break-all`}>claude mcp add --transport http agentsim http://127.0.0.1:3000/mcp/runs/{run!.id}</code>
          <div className="text-[#6b6b66]">Then paste the Task Brief into Claude Code:</div>
          <pre className={`${mono} whitespace-pre-wrap bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 max-h-32 overflow-auto`}>{run!.taskBrief}</pre>
          <button type="button" onClick={finish} disabled={busy} className="h-8 rounded bg-[#1d1d1b] text-white font-semibold disabled:opacity-50">Finish &amp; evaluate</button>
        </>
      ) : (
        <button type="button" onClick={create} disabled={busy} className="h-8 rounded border border-[#1d1d1b] bg-white font-semibold disabled:opacity-50">Create a BYO Run</button>
      )}
    </section>
  );
}
