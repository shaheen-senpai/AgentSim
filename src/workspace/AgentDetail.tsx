"use client";
// `/agents/[id]` — one agent: what it does, what it may do, and the Worlds it is examined in.
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { Button, LinkButton } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent, PackSummary } from "@/ui/types";
import type { TrustDimension } from "./agentStats";
import { SourceTag } from "./AgentCard";
import { updateAgent } from "./api";
import { EmptyState } from "./EmptyState";
import { Modal } from "./Modal";
import { Toast, type ToastMessage } from "./Toast";
import { TrustPanel } from "./TrustPanel";
import { card, container, enter, eyebrow, tag } from "./ui";
import { WorldCard } from "./WorldCard";

type Props = { agent: Agent; packs: PackSummary[]; trust: number | null; runs: number; dimensions: TrustDimension[] };

export function AgentDetail({ agent: initial, packs, trust, runs, dimensions }: Props) {
  const [agent, setAgent] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const byId = useMemo(() => new Map(packs.map((p) => [p.id, p])), [packs]);
  const attached = agent.worldIds.map((id) => byId.get(id)).filter((p): p is PackSummary => !!p);
  const available = packs.filter((p) => !agent.worldIds.includes(p.id));

  const save = async (worldIds: string[], done: string) => {
    setBusy(true);
    const result = await updateAgent({ ...agent, worldIds });
    setBusy(false);
    if (result.agent === null) {
      setToast({ title: "Not saved", body: result.error, tone: "danger" });
      return;
    }
    setAgent(result.agent);
    setToast({ title: done });
  };

  const attach = async () => {
    if (!choice) return;
    await save([...agent.worldIds, choice], `${byId.get(choice)?.name ?? "World"} attached to ${agent.name}`);
    setAdding(false);
    setChoice(null);
  };

  const dismiss = useCallback(() => setToast(null), []);
  const closeAdd = useCallback(() => { setAdding(false); setChoice(null); }, []);

  return (
    <main id="main" className={`${container} pb-24 pt-10`}>
      <Link href="/agents" className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> All agents
      </Link>

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <header className="animate-reveal">
          <div className="flex items-center gap-3">
            <SourceTag source={agent.source} />
            <span className={eyebrow}>{agent.source === "mcp" ? "Connected via MCP" : "Created by hand"} · {agent.shape}</span>
          </div>
          <h1 className="mt-4 font-heading text-display font-medium sm:text-6xl">{agent.name}</h1>
          {agent.description && <p className="mt-4 max-w-2xl text-lead text-muted-foreground">{agent.description}</p>}

          <section className={`${card} mt-8 p-5`} aria-labelledby="mandate-title">
            <h2 id="mandate-title" className={`${eyebrow} flex items-center gap-2`}><Icon name="shield" className="size-3.5" /> Mandate</h2>
            <p className="mt-3 font-label text-body leading-relaxed text-foreground">{agent.mandate ? `“${agent.mandate}”` : <span className="text-muted-foreground">No mandate recorded. Add one so violations have something to be graded against.</span>}</p>
          </section>

          <div className="mt-8 grid gap-8 sm:grid-cols-2">
            <section aria-labelledby="tools-title">
              <h2 id="tools-title" className={eyebrow}>Tools · {agent.tools.length}</h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {agent.tools.map((t, i) => <li key={t} className={`${tag} animate-reveal`} style={enter(i)}>{t}</li>)}
                {agent.tools.length === 0 && <li className="text-caption text-muted-foreground">None listed.</li>}
              </ul>
            </section>
            <section aria-labelledby="entities-title">
              <h2 id="entities-title" className={eyebrow}>Entities · {agent.entities.length}</h2>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {agent.entities.map((t, i) => <li key={t} className={`${tag} animate-reveal text-foreground`} style={enter(i)}>{t}</li>)}
                {agent.entities.length === 0 && <li className="text-caption text-muted-foreground">None listed.</li>}
              </ul>
            </section>
          </div>
        </header>

        <div className="animate-reveal [animation-delay:150ms]">
          <TrustPanel trust={trust} runs={runs} dimensions={dimensions} />
        </div>
      </div>

      <section className="mt-16" aria-labelledby="worlds-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={eyebrow}>Worlds · {attached.length}</p>
            <h2 id="worlds-title" className="mt-2 font-heading text-h2 font-medium">Controlled companies built around {agent.name}.</h2>
          </div>
          <Button onClick={() => setAdding(true)}><Icon name="plus" className="size-4" /> Add world</Button>
        </div>

        {attached.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon="globe" title="No worlds yet" body="Attach a seeded World, or generate one from this agent's tools and schemas, then run the first clean-versus-poisoned shift.">
              <Button variant="outline" onClick={() => setAdding(true)}><Icon name="plus" className="size-4" /> Attach a world</Button>
              <LinkButton href="/worlds/new">Generate a world <Icon name="arrow-right" className="size-4" /></LinkButton>
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {attached.map((w, i) => (
              <li key={w.id}>
                <WorldCard world={w} style={enter(i)} onDetach={() => save(agent.worldIds.filter((id) => id !== w.id), `${w.name} detached`)} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal open={adding} onClose={closeAdd} eyebrow="Add world" title={`Where should ${agent.name} be examined?`}>
        {available.length === 0 ? (
          <p className="text-body text-muted-foreground">Every installed World is already attached. Generate a new one from this agent&apos;s tools.</p>
        ) : (
          <ul className="flex flex-col gap-2" role="radiogroup" aria-label="Installed worlds">
            {available.map((p) => (
              <li key={p.id}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-control border px-4 py-3 transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${choice === p.id ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"}`}>
                  <input type="radio" name="world" value={p.id} checked={choice === p.id} onChange={() => setChoice(p.id)} className="sr-only" />
                  <Icon name="globe" className={`mt-0.5 size-4 shrink-0 ${choice === p.id ? "text-primary" : "text-muted-foreground"}`} />
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-2"><span className="font-heading text-body font-semibold">{p.name}</span><span className="font-label text-[11px] text-muted-foreground">{p.domain} · {p.scenarios} scenarios</span></span>
                    <span className="mt-0.5 block text-caption text-muted-foreground">{p.description}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/worlds/new" className="inline-flex items-center gap-1 text-caption text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            Generate a new World instead <Icon name="arrow-right" className="size-3.5" />
          </Link>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeAdd}>Cancel</Button>
            <Button onClick={attach} disabled={!choice || busy}>{busy ? "Attaching…" : "Attach world"}</Button>
          </div>
        </div>
      </Modal>

      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}
