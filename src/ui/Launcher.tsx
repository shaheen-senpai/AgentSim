"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { PackOption, RunRecord } from "./types";
import { heading, panel, primaryButton } from "./styles";

type Props = { packs: PackOption[]; run: RunRecord | null; onPromptDiff: () => void };

function Seg<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex border border-[#E3E0D5] rounded overflow-hidden">
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-[13px] flex-1 ${o.value === value ? "bg-[#1B1A17] text-white" : "bg-white"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A pack's Reference Agent versions for the Launcher — "generic" (the runner's own fallback prompt) when the pack ships none. */
function versionsFor(pack: PackOption | undefined): string[] {
  return pack && pack.agentVersions.length > 0 ? pack.agentVersions : ["generic"];
}

function defaultVersion(pack: PackOption | undefined): string {
  const versions = versionsFor(pack);
  return versions.includes("naive") ? "naive" : versions[0];
}

export function Launcher({ packs, run, onPromptDiff }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [packId, setPackId] = useState(() => run?.packId ?? searchParams.get("packId") ?? packs[0]?.id ?? "");
  const pack = packs.find((p) => p.id === packId) ?? packs[0];

  const [scenarioId, setScenarioId] = useState(() => run?.scenarioId ?? searchParams.get("scenarioId") ?? pack?.scenarios[0]?.id ?? "");
  const scenario = pack?.scenarios.find((s) => s.id === scenarioId);

  const [agentVersion, setAgentVersion] = useState(() =>
    run?.agent.kind === "reference" ? run.agent.version : defaultVersion(pack),
  );
  const [attackId, setAttackId] = useState<string | "off">(run?.attack?.id ?? "off");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectPack(id: string) {
    setPackId(id);
    const next = packs.find((p) => p.id === id);
    setScenarioId(next?.scenarios[0]?.id ?? "");
    setAgentVersion(defaultVersion(next));
    setAttackId("off");
  }

  async function start() {
    setBusy(true);
    setError(null);
    try {
      if (!pack || !scenarioId) throw new Error("Pick a Scenario first");
      const body = { packId: pack.id, scenarioId, agent: { kind: "reference" as const, version: agentVersion }, attackId: attackId === "off" ? null : attackId };
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
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
      <div className={heading}>World</div>
      <select value={packId} onChange={(e) => selectPack(e.target.value)} className="border border-[#E3E0D5] rounded px-2 py-1.5 bg-white text-[13px]">
        {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      <div className={heading}>Scenario</div>
      <select value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); setAttackId("off"); }} className="border border-[#E3E0D5] rounded px-2 py-1.5 bg-white text-[13px]">
        {(pack?.scenarios ?? []).map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
      </select>
      <div className={heading}>Agent</div>
      <Seg value={agentVersion} options={versionsFor(pack).map((v) => ({ value: v, label: v === "naive" ? "naïve" : v }))} onChange={setAgentVersion} />
      <button type="button" onClick={onPromptDiff} className="text-xs underline text-left">View prompt diff</button>
      <div className={heading}>Attack</div>
      <Seg value={attackId} options={[{ value: "off", label: "off" }, ...(scenario?.attacks ?? []).map((a) => ({ value: a.id, label: a.id }))]} onChange={setAttackId} />
      <button type="button" onClick={start} disabled={busy || !scenarioId} className={`${primaryButton} mt-1 w-full`}>
        {busy ? "Starting…" : "▷ Run"}
      </button>
      {error && <div className="text-xs text-[#B23A22]">{error}</div>}
    </section>
  );
}
