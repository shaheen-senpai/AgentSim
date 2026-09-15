"use client";
// The client island behind `/connect` (spec §6.3) — "any agent, nothing to install, just a URL".
//
// Left: the agents this team has registered, and the form to add or edit one. Right: a Run started
// for the selected agent, and then the connection card with the snippets for that agent's shape.
//
// No value import of `@/engine/pack`, `@/runner/agentRegistry` or `@/runner/store`: the page is a
// Server Component that hands this island its initial data as plain props, and everything after
// that happens over `fetch`.
import { useState } from "react";
import type { Agent, PackOption } from "@/ui/types";
import { hint } from "@/ui/styles";
import { AgentList } from "./AgentList";
import { ConnectionCard } from "./ConnectionCard";
import { RegisterAgent, type AgentSubmission } from "./RegisterAgent";
import { StartRun, type CreatedRun } from "./StartRun";

type Props = { packs: PackOption[]; initialAgents: Agent[] };

/** The API's `{ error }` body, or a plain HTTP explanation — whichever it actually gave us. */
async function failureOf(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `${fallback} (HTTP ${res.status}).`;
}

export function ConnectPage({ packs, initialAgents }: Props) {
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [selectedId, setSelectedId] = useState<string | null>(initialAgents[0]?.id ?? null);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [created, setCreated] = useState<CreatedRun | null>(null);

  const selected = agents.find((a) => a.id === selectedId) ?? null;

  async function reload(selectId?: string): Promise<void> {
    const res = await fetch("/api/agents", { cache: "no-store" });
    if (!res.ok) return;
    const next = (await res.json()) as Agent[];
    setAgents(next);
    setSelectedId((current) => selectId ?? (next.some((a) => a.id === current) ? current : (next[0]?.id ?? null)));
  }

  async function submit(submission: AgentSubmission): Promise<string | null> {
    setNotice(null);
    const editingId = editing?.id;
    try {
      const res = editingId
        ? await fetch(`/api/agents/${editingId}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) })
        : await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(submission) });
      if (!res.ok) return await failureOf(res, editingId ? "The agent was not updated" : "The agent was not registered");
      const saved = (await res.json()) as Agent;
      await reload(saved.id);
      setEditing(null);
      return null;
    } catch {
      return "Network error — nothing was saved.";
    }
  }

  async function remove(agent: Agent): Promise<void> {
    setNotice(null);
    setBusyId(agent.id);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      if (!res.ok) {
        setNotice(await failureOf(res, "The agent was not deleted"));
        return;
      }
      if (editing?.id === agent.id) setEditing(null);
      await reload();
      setNotice(`${agent.name} deleted. Runs it already started keep their own copy of it.`);
    } catch {
      setNotice("Network error — nothing was deleted.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="grid gap-4 items-start lg:grid-cols-[minmax(320px,400px)_1fr]">
      <div className="flex flex-col gap-4">
        <AgentList
          agents={agents}
          selectedId={selectedId}
          busyId={busyId}
          onSelect={(id) => setSelectedId(id)}
          onEdit={(agent) => setEditing(agent)}
          onDelete={remove}
        />
        <div role="status" aria-live="polite" className="text-[12px] empty:hidden">
          {notice && <p className="border border-[#cfcfcb] bg-white rounded p-2">{notice}</p>}
        </div>
        {/* Remounted per edited agent so the fields always start from the agent being edited. */}
        <RegisterAgent key={editing?.id ?? "new"} editing={editing} onSubmit={submit} onCancel={() => setEditing(null)} />
      </div>

      <div className="flex flex-col gap-4">
        <StartRun packs={packs} agent={selected} onCreated={setCreated} />
        {created ? (
          <ConnectionCard key={created.id} run={created} />
        ) : (
          <p className={hint}>
            Create a Run and the connection instructions for your agent&rsquo;s shape appear here, carrying this Run&rsquo;s own URL.
          </p>
        )}
      </div>
    </div>
  );
}
