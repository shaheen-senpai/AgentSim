"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RunRecord, ScenarioSummary } from "./types";
import { heading, panel } from "./styles";

type Props = { scenarios: ScenarioSummary[]; run: RunRecord | null; onPromptDiff: () => void };

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex border border-[#cfcfcb] rounded overflow-hidden">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-[13px] flex-1 ${o.value === value ? "bg-[#1d1d1b] text-white" : "bg-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Launcher({ scenarios, run, onPromptDiff }: Props) {
  const router = useRouter();
  const [scenarioId, setScenarioId] = useState(run?.scenarioId ?? scenarios[0]?.id ?? "");
  const [agent, setAgent] = useState<"naive" | "fixed">(run?.agent.kind === "reference" && run.agent.version === "fixed" ? "fixed" : "naive");
  const [attackId, setAttackId] = useState<string | "off">(run?.attack?.id ?? "off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scenario = scenarios.find((s) => s.id === scenarioId);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenarioId, agent, attackId: attackId === "off" ? null : attackId }) });
      if (!res.ok) throw new Error(`Run failed to start (HTTP ${res.status})`);
      const { id } = (await res.json()) as { id: string };
      router.push(`/runs/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${panel} p-4 flex flex-col gap-3`}>
      <div className={heading}>Scenario</div>
      <select value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); setAttackId("off"); }} className="border border-[#cfcfcb] rounded px-2 py-1.5 bg-white text-[13px]">
        {scenarios.map((s) => <option key={s.id} value={s.id}>{s.id}</option>)}
      </select>
      <div className={heading}>Agent</div>
      <Seg value={agent} options={[{ value: "naive", label: "naïve" }, { value: "fixed", label: "fixed" }]} onChange={setAgent} />
      <button type="button" onClick={onPromptDiff} className="text-xs underline text-left">View prompt diff</button>
      <div className={heading}>Attack</div>
      <Seg value={attackId} options={[{ value: "off", label: "off" }, ...(scenario?.attacks ?? []).map((a) => ({ value: a.id, label: a.id }))]} onChange={setAttackId} />
      <button type="button" onClick={start} disabled={busy || !scenarioId} className="mt-1 h-9 rounded bg-[#1d1d1b] text-white font-semibold disabled:opacity-50">
        {busy ? "Starting…" : "▷ Run"}
      </button>
      {error && <div className="text-xs text-[#c8321e]">{error}</div>}
    </section>
  );
}
