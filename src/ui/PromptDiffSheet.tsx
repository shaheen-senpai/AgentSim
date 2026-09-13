"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lineDiff } from "./lineDiff";
import type { RunRecord } from "./types";
import { mono } from "./styles";

export function PromptDiffSheet({ open, onClose, run }: { open: boolean; onClose: () => void; run: RunRecord | null }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<{ naive: string; fixed: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || prompts) return;
    Promise.all(["naive", "fixed"].map((v) => fetch(`/api/agents/${v}/prompt`).then((r) => r.json() as Promise<{ prompt: string }>)))
      .then(([n, f]) => setPrompts({ naive: n.prompt, fixed: f.prompt }))
      .catch(() => setPrompts({ naive: "(failed to load)", fixed: "(failed to load)" }));
  }, [open, prompts]);

  async function rerunFixed() {
    if (!run) return;
    setBusy(true);
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId: run.scenarioId, agent: "fixed", attackId: run.attack?.id ?? null }) });
      const { id } = (await res.json()) as { id: string };
      onClose();
      router.push(`/runs/${id}`);
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const lines = prompts ? lineDiff(prompts.naive, prompts.fixed) : [];
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/20" onClick={onClose}>
      <div className="w-[720px] max-w-full h-full bg-white border-l border-[#cfcfcb] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#cfcfcb]">
          <div className="font-bold">Reference Agent · system prompt</div>
          <span className="text-xs text-[#6b6b66]">naïve → fixed</span>
          <button type="button" onClick={onClose} className="ml-auto text-xs underline">close</button>
        </div>
        <pre className={`${mono} flex-1 overflow-auto px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap`}>
          {prompts ? lines.map((l, i) => (
            <div key={i} className={l.kind === "del" ? "bg-[#fbeeea] text-[#8a2a1c] line-through" : l.kind === "add" ? "bg-[#eef6f0] text-[#1f5c38]" : ""}>
              {l.kind === "del" ? "- " : l.kind === "add" ? "+ " : "  "}{l.text}
            </div>
          )) : "loading…"}
        </pre>
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[#cfcfcb]">
          <span className="text-xs text-[#6b6b66]">Same model ({run?.model ?? "claude-haiku-4-5"}), same tools, same Scenario{run?.attack ? ", same Attack" : ""}.</span>
          <button type="button" onClick={rerunFixed} disabled={busy || !run || run.agent === "fixed"} className="ml-auto h-8 px-4 rounded bg-[#1d1d1b] text-white font-semibold text-sm disabled:opacity-50">
            {busy ? "Starting…" : "▷ Rerun with fixed"}
          </button>
        </div>
      </div>
    </div>
  );
}
