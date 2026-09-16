"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { lineDiff } from "./lineDiff";
import type { RunRecord } from "./types";
import { mono, primaryButton } from "./styles";

export function PromptDiffSheet({ open, onClose, run }: { open: boolean; onClose: () => void; run: RunRecord | null }) {
  const router = useRouter();
  const [prompts, setPrompts] = useState<{ naive: string; fixed: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || prompts) return;
    Promise.all(["naive", "fixed"].map((v) => fetch(`/api/agents/${v}/prompt`).then((r) => r.json() as Promise<{ prompt: string }>)))
      .then(([n, f]) => setPrompts({ naive: n.prompt, fixed: f.prompt }))
      .catch(() => setPrompts({ naive: "(failed to load)", fixed: "(failed to load)" }));
  }, [open, prompts]);

  async function rerunFixed() {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ packId: run.packId, scenarioId: run.scenarioId, agent: { kind: "reference", version: "fixed" }, attackId: run.attack?.id ?? null }) });
      if (!res.ok) throw new Error(`Rerun failed to start (HTTP ${res.status})`);
      const { id } = (await res.json()) as { id: string };
      onClose();
      router.push(`/runs/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;
  const lines = prompts ? lineDiff(prompts.naive, prompts.fixed) : [];
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/20" onClick={onClose}>
      <div className="w-[720px] max-w-full h-full bg-white border-l border-[#E3E0D5] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E3E0D5]">
          <div className="font-bold">Reference Agent · system prompt</div>
          <span className="text-xs text-[#6E6B60]">naïve → fixed</span>
          <button type="button" onClick={onClose} className="ml-auto text-xs underline">close</button>
        </div>
        <pre className={`${mono} flex-1 overflow-auto px-4 py-3 text-[12.5px] leading-relaxed whitespace-pre-wrap`}>
          {prompts ? lines.map((l, i) => (
            <div key={i} className={l.kind === "del" ? "bg-[#FBEAE7] text-[#B23A22] line-through" : l.kind === "add" ? "bg-[#E7F4EA] text-[#1E7A43]" : ""}>
              {l.kind === "del" ? "- " : l.kind === "add" ? "+ " : "  "}{l.text}
            </div>
          )) : "loading…"}
        </pre>
        <div className="flex items-center gap-3 px-4 py-3 border-t border-[#E3E0D5]">
          <span className="text-xs text-[#6E6B60]">Same model ({(run?.agent.kind === "reference" ? run.agent.model : null) ?? "claude-haiku-4-5"}), same tools, same Scenario{run?.attack ? ", same Attack" : ""}.</span>
          {error && <span className="text-xs text-[#B23A22]">{error}</span>}
          <button type="button" onClick={rerunFixed} disabled={busy || !run || run.agent.kind === "reference" && run.agent.version === "fixed"} className={`${primaryButton} ml-auto`}>
            {busy ? "Starting…" : "▷ Rerun with fixed"}
          </button>
        </div>
      </div>
    </div>
  );
}
