"use client";
// Right column of `/connect` (spec §6.3): start a Run for the selected agent.
//
// pack → Scenario → Attack → idle timeout → Create Run. The body is the v2 shape
// (`agent: { kind: "byo", agentId }`); the response carries the Run's own `url`, `mcpUrl` and
// `callUrl`, derived server-side from the request origin, and those are what the connection card
// builds every snippet from.
import { useId, useState } from "react";
import type { Agent, PackOption } from "@/ui/types";
import { field, heading, hint, label, panel, primaryButton } from "@/ui/styles";

/** What `POST /api/runs` hands back, plus the agent it was started for — everything the card needs. */
export type CreatedRun = {
  id: string;
  url: string;
  mcpUrl: string;
  callUrl: string;
  taskBrief: string;
  agentName: string;
  shape: Agent["shape"];
};

const OFF = "off";

/** Spec §6.3: 30 s · 2 min · 10 min · off. A BYO Run with no Events for this long finishes itself. */
const IDLE_OPTIONS: { value: string; label: string; ms: number | null }[] = [
  { value: "30s", label: "30 s", ms: 30_000 },
  { value: "2m", label: "2 min", ms: 120_000 },
  { value: "10m", label: "10 min", ms: 600_000 },
  { value: OFF, label: "off", ms: null },
];

type Props = { packs: PackOption[]; agent: Agent | null; onCreated: (run: CreatedRun) => void };

export function StartRun({ packs, agent, onCreated }: Props) {
  const ids = useId();
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const pack = packs.find((p) => p.id === packId) ?? packs[0];
  const [scenarioId, setScenarioId] = useState(pack?.scenarios[0]?.id ?? "");
  const scenario = pack?.scenarios.find((s) => s.id === scenarioId);
  const [attackId, setAttackId] = useState<string>(OFF);
  const [idle, setIdle] = useState<string>("2m");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function selectPack(id: string) {
    setPackId(id);
    const next = packs.find((p) => p.id === id);
    setScenarioId(next?.scenarios[0]?.id ?? "");
    setAttackId(OFF);
  }

  async function create() {
    if (!agent || !pack || !scenarioId) return;
    setPending(true);
    setError(null);
    try {
      const body = {
        packId: pack.id,
        scenarioId,
        attackId: attackId === OFF ? null : attackId,
        agent: { kind: "byo" as const, agentId: agent.id },
        idleTimeoutMs: IDLE_OPTIONS.find((o) => o.value === idle)?.ms ?? null,
      };
      const res = await fetch("/api/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { id?: string; url?: string; mcpUrl?: string; callUrl?: string; taskBrief?: string; error?: string };
      if (!res.ok || !data.id || !data.mcpUrl || !data.callUrl || !data.url) {
        setError(data.error ?? `The Run was not created (HTTP ${res.status}).`);
        return;
      }
      onCreated({
        id: data.id,
        url: data.url,
        mcpUrl: data.mcpUrl,
        callUrl: data.callUrl,
        taskBrief: data.taskBrief ?? "",
        agentName: agent.name,
        shape: agent.shape,
      });
    } catch {
      setError("Network error — no Run was created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={`${panel} p-3 flex flex-col gap-3`} aria-labelledby={`${ids}-heading`}>
      <h2 id={`${ids}-heading`} className={heading}>
        Start a Run
      </h2>

      {agent === null ? (
        <p className={hint}>Select an agent on the left — or register one — and a Run can be started for it.</p>
      ) : (
        <p className={hint}>
          For <strong className="font-semibold text-[#1d1d1b]">{agent.name}</strong> {agent.version}. The Run copies its shape and aliases, so
          editing the agent later never rewrites this Run.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-pack`} className={label}>
            World pack
          </label>
          <select id={`${ids}-pack`} value={packId} onChange={(e) => selectPack(e.target.value)} className={field}>
            {packs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-scenario`} className={label}>
            Scenario
          </label>
          <select
            id={`${ids}-scenario`}
            value={scenarioId}
            onChange={(e) => {
              setScenarioId(e.target.value);
              setAttackId(OFF);
            }}
            className={field}
          >
            {(pack?.scenarios ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-attack`} className={label}>
          Attack
        </label>
        <select id={`${ids}-attack`} value={attackId} onChange={(e) => setAttackId(e.target.value)} className={field}>
          <option value={OFF}>off — the clean World</option>
          {(scenario?.attacks ?? []).map((a) => (
            <option key={a.id} value={a.id}>
              {a.title}
            </option>
          ))}
        </select>
        <p className={hint}>An Attack plants a Lure in the World&rsquo;s own data. Nothing about the Task Brief changes.</p>
      </div>

      <fieldset className="flex flex-col gap-1 border-0 p-0 m-0">
        <legend className={label}>Idle timeout</legend>
        <div className="flex gap-1">
          {IDLE_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setIdle(o.value)}
              aria-pressed={idle === o.value}
              className={`h-7 flex-1 rounded px-2 text-[12px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] ${
                idle === o.value ? "bg-[#1d1d1b] text-white border-[#1d1d1b] font-semibold" : "bg-white text-[#6b6b66] border-[#cfcfcb] hover:text-[#1d1d1b]"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <p className={hint}>How long the Run waits after the last Event before it finishes and scores itself.</p>
      </fieldset>

      <div className="flex items-center gap-2">
        <button type="button" onClick={create} disabled={pending || !agent || !scenarioId} className={primaryButton}>
          {pending ? "Creating…" : "Create Run"}
        </button>
        {!agent && <span className={hint}>No agent selected.</span>}
      </div>

      <div role="status" aria-live="polite" className="text-[12px] empty:hidden">
        {error && <p className="border border-[#c8321e] bg-[#fbeeea] rounded p-2 text-[#c8321e] font-semibold">{error}</p>}
      </div>
    </section>
  );
}
