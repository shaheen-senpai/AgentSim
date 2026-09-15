"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { RunRecord } from "./types";
import { heading, mono, panel } from "./styles";

/** ms left before the idle timer fires, from the last Event's `endedAt` (or Run creation, if none yet); `null` when disabled. */
function idleRemainingMs(run: RunRecord): number | null {
  if (run.idleTimeoutMs === null) return null;
  const last = run.events.at(-1)?.endedAt ?? new Date(run.createdAt).getTime();
  return run.idleTimeoutMs - (Date.now() - last);
}

export function ConnectAgent({ run }: { run: RunRecord | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [, tick] = useState(0); // re-render once a second so the idle countdown below counts down
  const isLiveByo = run !== null && run.agent.kind === "byo" && run.status === "running";

  useEffect(() => {
    if (!isLiveByo) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [isLiveByo]);

  async function finish() {
    if (!run) return;
    setBusy(true);
    try {
      await fetch(`/api/runs/${run.id}/finish`, { method: "POST" });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!isLiveByo) {
    return (
      <section className={`${panel} p-4 flex items-center justify-between text-xs`}>
        <div className={heading}>Connect your agent</div>
        <Link href="/connect" className="font-semibold underline">Connect →</Link>
      </section>
    );
  }

  // Task 9 returns this from POST /api/runs; a stored Run doesn't keep it, so it's re-derived from
  // the page's own origin — a tunnel, a LAN address and localhost each hand back a URL that resolves.
  const mcpUrl = typeof window !== "undefined" ? `${window.location.origin}/mcp/runs/${run.id}` : `/mcp/runs/${run.id}`;
  const remainingMs = idleRemainingMs(run);

  return (
    <section className={`${panel} p-4 flex flex-col gap-2 text-xs`}>
      <div className="flex items-center justify-between">
        <div className={heading}>Connect your agent</div>
        <Link href="/connect" className="underline">Manage →</Link>
      </div>
      <div className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[#2f7d4f]" />
        <span className="font-semibold">Live · {run.events.length} event{run.events.length === 1 ? "" : "s"}</span>
      </div>
      {remainingMs !== null && (
        <div className="text-[#6b6b66]">Idle timeout in {Math.max(0, Math.round(remainingMs / 1000))}s</div>
      )}
      <code className={`${mono} bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 break-all`}>{mcpUrl}</code>
      <button type="button" onClick={finish} disabled={busy} className="h-8 rounded bg-[#1d1d1b] text-white font-semibold disabled:opacity-50">
        Finish &amp; evaluate
      </button>
    </section>
  );
}
