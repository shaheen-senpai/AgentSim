"use client";
// `/agents/[id]` — one agent, its trust, and straight into the Worlds it is examined in. A World is
// either a pack on disk attached to the agent, or one drafted for it (by the plugin, or here).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { LinkButton } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent, PackSummary } from "@/ui/types";
import { SourceTag } from "./AgentCard";
import { updateAgent } from "./api";
import { Clamp } from "./Clamp";
import { EmptyState } from "./EmptyState";
import { Toast, type ToastMessage } from "./Toast";
import { container, enter, eyebrow } from "./ui";
import { WorldCard } from "./WorldCard";
import { worldViews } from "./worlds";

type Props = { agent: Agent; packs: PackSummary[]; trust: number | null; runs: number; freshId?: string | null };

export function AgentDetail({ agent: initial, packs, trust, runs, freshId: initialFreshId = null }: Props) {
  const [agent, setAgent] = useState(initial);
  const [freshId, setFreshId] = useState<string | null>(initialFreshId);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const views = useMemo(() => worldViews(agent, packs), [agent, packs]);

  const save = async (next: Agent, done: string): Promise<boolean> => {
    const result = await updateAgent(next);
    if (result.agent === null) {
      setToast({ title: "Not saved", body: result.error, tone: "danger" });
      return false;
    }
    setAgent(result.agent);
    setToast({ title: done });
    return true;
  };

  const remove = (view: (typeof views)[number]) => {
    if (view.kind === "draft") return save({ ...agent, worlds: agent.worlds.filter((w) => w.id !== view.id) }, `${view.name} deleted`);
    return save({ ...agent, worldIds: agent.worldIds.filter((id) => id !== view.id) }, `${view.name} detached`);
  };

  const dismiss = useCallback(() => setToast(null), []);

  // The highlight on a just-created World fades after a few seconds.
  useEffect(() => {
    if (!initialFreshId) return;
    const t = window.setTimeout(() => setFreshId(null), 3000);
    return () => window.clearTimeout(t);
  }, [initialFreshId]);

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <Link href="/agents" className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> All agents
      </Link>

      <div className="mt-6">
        <header className="animate-reveal">
          <div className="flex flex-wrap items-center gap-3">
            <SourceTag source={agent.source} />
            <span className={eyebrow}>
              {agent.source === "mcp" ? "Connected via MCP" : "Created by hand"} · {agent.tools.length} tools · {agent.entities.length} entities ·{" "}
              {trust === null ? "no shifts yet" : `trust ${trust} over ${runs} run${runs === 1 ? "" : "s"}`}
            </span>
          </div>
          <h1 className="mt-3 font-heading text-display font-semibold">{agent.name}</h1>
          {agent.description && <Clamp text={agent.description} lines={4} className="mt-2 max-w-2xl text-lead text-muted-foreground" />}
        </header>
      </div>

      <section className="mt-8" aria-labelledby="worlds-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={eyebrow}>Worlds · {views.length}</p>
            <h2 id="worlds-title" className="mt-1 font-heading text-h2 font-semibold">Worlds</h2>
          </div>
          <LinkButton href={`/agents/${agent.id}/worlds/new`}><Icon name="plus" className="size-4" /> Add world</LinkButton>
        </div>

        {views.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon="globe" title="No worlds yet" body="Draft a seeded World from this agent's tools, or attach one already installed, then run the first clean-versus-poisoned shift.">
              <LinkButton href={`/agents/${agent.id}/worlds/new`}><Icon name="plus" className="size-4" /> Add world</LinkButton>
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {views.map((w, i) => (
              <li key={w.id}>
                <WorldCard world={w} style={enter(i)} fresh={w.id === freshId} onRemove={() => remove(w)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}
