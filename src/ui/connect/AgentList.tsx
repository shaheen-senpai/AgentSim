"use client";
// Left column of `/connect` (spec §6.3): the agents this team has registered.
//
// An Agent is a saved *description* of someone's agent — how it will talk to us (`shape`) and what
// it calls our tools (`toolAliases`). Selecting one is what a Run is started for; a Run copies the
// name, shape and aliases at creation, so editing one here never rewrites a finished Run.
import type { Agent } from "@/ui/types";
import { heading, hint, mono, panel, secondaryButton } from "@/ui/styles";

const SHAPE_LABEL: Record<Agent["shape"], string> = {
  mcp: "MCP",
  forwarder: "Forwarder",
  connector: "Connector",
};

type Props = {
  agents: Agent[];
  selectedId: string | null;
  busyId: string | null;
  onSelect: (id: string) => void;
  onEdit: (agent: Agent) => void;
  onDelete: (agent: Agent) => void;
};

export function AgentList({ agents, selectedId, busyId, onSelect, onEdit, onDelete }: Props) {
  return (
    <section className={`${panel} p-3 flex flex-col gap-2`} aria-labelledby="agent-list-heading">
      <h2 id="agent-list-heading" className={heading}>
        Your agents
      </h2>

      {agents.length === 0 ? (
        <p className={hint}>
          No agents registered yet. Describe yours below — it takes a name, a version and the shape it will connect in.
        </p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {agents.map((agent) => {
            const selected = agent.id === selectedId;
            const aliases = Object.keys(agent.toolAliases ?? {}).length;
            return (
              <li
                key={agent.id}
                className={`rounded border px-2 py-2 flex items-start gap-2 ${selected ? "border-[#1d1d1b] bg-[#fafaf8]" : "border-[#cfcfcb] bg-white"}`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(agent.id)}
                  aria-pressed={selected}
                  className="flex-1 text-left flex flex-col gap-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] rounded"
                >
                  <span className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold">{agent.name}</span>
                    <span className={`${mono} text-[11px] text-[#6b6b66]`}>{agent.version}</span>
                    <span className="text-[10px] uppercase tracking-[.06em] border border-[#cfcfcb] rounded-full px-1.5 py-px text-[#6b6b66]">
                      {SHAPE_LABEL[agent.shape] ?? agent.shape}
                    </span>
                  </span>
                  <span className={hint}>
                    {aliases} {aliases === 1 ? "alias" : "aliases"}
                    {agent.notes ? ` · ${agent.notes}` : ""}
                  </span>
                </button>
                <span className="flex flex-col gap-1">
                  <button type="button" onClick={() => onEdit(agent)} className={`${secondaryButton} h-6`}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(agent)}
                    disabled={busyId === agent.id}
                    className={`${secondaryButton} h-6 text-[#c8321e] hover:border-[#c8321e]`}
                  >
                    Delete
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
