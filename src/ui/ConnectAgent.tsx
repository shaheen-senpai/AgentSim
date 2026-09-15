"use client";
// The Run page's connection card. For a live BYO Run it is the control surface: how many Events
// have landed, how long the Run will wait before finishing itself, the MCP URL to point an agent
// at, and *Finish & evaluate*. Otherwise it is simply the way to `/connect`.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyButton } from "./connect/CopyButton";
import { idleRemainingMs, mmss } from "./idle";
import { heading, mono, panel, primaryButton } from "./styles";
import type { RunRecord } from "./types";
import { useOrigin } from "./useOrigin";

export function ConnectAgent({ run }: { run: RunRecord | null }) {
  const router = useRouter();
  const origin = useOrigin();
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
        <Link
          href="/connect"
          className="font-semibold underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] rounded"
        >
          Connect →
        </Link>
      </section>
    );
  }

  // `POST /api/runs` returned this URL at creation; a stored Run doesn't keep it, so it is
  // re-derived from the origin this page was served from — never a hardcoded one.
  const mcpUrl = origin === null ? null : `${origin}/mcp/runs/${run.id}`;
  const remainingMs = idleRemainingMs(run);

  return (
    <section className={`${panel} p-4 flex flex-col gap-2 text-xs`}>
      <div className="flex items-center justify-between">
        <div className={heading}>Connect your agent</div>
        <Link
          href="/connect"
          className="underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] rounded"
        >
          Manage →
        </Link>
      </div>
      {/* Only the Event count is live: it changes when something actually happens, which is worth
          announcing. The countdown below re-renders every second, and inside this region a screen
          reader would read the whole block out once a second. */}
      <div role="status" aria-live="polite" className="flex items-center gap-2">
        <span className="inline-block w-2 h-2 rounded-full bg-[#2f7d4f]" />
        <span className="font-semibold">
          Live · {run.events.length} {run.events.length === 1 ? "Event" : "Events"}
        </span>
      </div>
      {remainingMs !== null && (
        <div aria-live="off" className="text-[#6b6b66]">
          Finishes itself in {mmss(remainingMs)} if nothing else happens
        </div>
      )}
      {mcpUrl && (
        <>
          <code className={`${mono} bg-[#fafaf8] border border-[#cfcfcb] rounded p-2 break-all`}>{mcpUrl}</code>
          <CopyButton text={mcpUrl} what="MCP URL" />
        </>
      )}
      <button type="button" onClick={finish} disabled={busy} className={`${primaryButton} h-8`}>
        {busy ? "Evaluating…" : "Finish & evaluate"}
      </button>
    </section>
  );
}
