"use client";
// `/agents/[id]` — one agent, its trust, and straight into the Worlds it is examined in. A World is
// either a pack on disk attached to the agent, or one drafted for it (by the plugin, or here).
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { Button, LinkButton } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent, PackSummary } from "@/ui/types";
import { SourceTag } from "./AgentCard";
import { updateAgent } from "./api";
import { EmptyState } from "./EmptyState";
import type { HandshakeStep } from "./handshake";
import { Modal } from "./Modal";
import { Toast, type ToastMessage } from "./Toast";
import { container, enter, eyebrow } from "./ui";
import { WorldCard } from "./WorldCard";
import { buildWorldDraftScript, newWorldId, nextDraftWorld, worldViews } from "./worlds";

type Props = { agent: Agent; packs: PackSummary[]; trust: number | null; runs: number };
type Mode = "draft" | "attach";

export function AgentDetail({ agent: initial, packs, trust, runs }: Props) {
  const [agent, setAgent] = useState(initial);
  const [adding, setAdding] = useState(false);
  const [mode, setMode] = useState<Mode>("draft");
  const [choice, setChoice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [script, setScript] = useState<HandshakeStep[]>([]);
  const [freshId, setFreshId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timers = useRef<number[]>([]);

  const views = useMemo(() => worldViews(agent, packs), [agent, packs]);
  const available = packs.filter((p) => !agent.worldIds.includes(p.id));
  const draft = useMemo(() => nextDraftWorld(agent), [agent]);

  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
  };

  const save = async (next: Agent, done: string): Promise<boolean> => {
    setBusy(true);
    const result = await updateAgent(next);
    setBusy(false);
    if (result.agent === null) {
      setToast({ title: "Not saved", body: result.error, tone: "danger" });
      return false;
    }
    setAgent(result.agent);
    setToast({ title: done });
    return true;
  };

  const closeAdd = useCallback(() => {
    clearTimers();
    setAdding(false);
    setChoice(null);
    setScript([]);
  }, []);

  const attach = async () => {
    if (!choice) return;
    const ok = await save({ ...agent, worldIds: [...agent.worldIds, choice] }, `${packs.find((p) => p.id === choice)?.name ?? "World"} attached to ${agent.name}`);
    if (ok) {
      setFreshId(choice);
      window.setTimeout(() => setFreshId(null), 3000);
      closeAdd();
    }
  };

  /** Plays the drafting script, then saves the new World at the top of the agent's list. */
  const draftWorld = () => {
    clearTimers();
    setScript([]);
    setBusy(true);
    const steps = buildWorldDraftScript(draft.name, agent.tools.length || 4);
    for (const step of steps) {
      timers.current.push(
        window.setTimeout(async () => {
          setScript((s) => [...s, step]);
          if (!step.done) return;
          const world = { ...draft, id: newWorldId(), createdAt: new Date().toISOString() };
          const ok = await save({ ...agent, worlds: [world, ...agent.worlds] }, `${world.name} drafted for ${agent.name}`);
          if (ok) {
            setFreshId(world.id);
            window.setTimeout(() => setFreshId(null), 3000);
            timers.current.push(window.setTimeout(closeAdd, 500));
          }
        }, step.at),
      );
    }
  };

  const remove = (view: (typeof views)[number]) => {
    if (view.kind === "draft") return save({ ...agent, worlds: agent.worlds.filter((w) => w.id !== view.id) }, `${view.name} deleted`);
    return save({ ...agent, worldIds: agent.worldIds.filter((id) => id !== view.id) }, `${view.name} detached`);
  };

  const dismiss = useCallback(() => setToast(null), []);
  const drafting = busy && mode === "draft" && script.length > 0;
  const progress = script.length === 0 ? 0 : Math.round((script.length / 5) * 100);

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
          {agent.description && <p className="mt-2 max-w-2xl text-lead text-muted-foreground">{agent.description}</p>}
        </header>
      </div>

      <section className="mt-8" aria-labelledby="worlds-title">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className={eyebrow}>Worlds · {views.length}</p>
            <h2 id="worlds-title" className="mt-1 font-heading text-h2 font-semibold">Worlds</h2>
          </div>
          <Button onClick={() => { setMode("draft"); setAdding(true); }}><Icon name="plus" className="size-4" /> Add world</Button>
        </div>

        {views.length === 0 ? (
          <div className="mt-6">
            <EmptyState icon="globe" title="No worlds yet" body="Draft a seeded World from this agent's tools, or attach one already installed, then run the first clean-versus-poisoned shift.">
              <Button onClick={() => { setMode("draft"); setAdding(true); }}><Icon name="plus" className="size-4" /> Draft a world</Button>
              <Button variant="outline" onClick={() => { setMode("attach"); setAdding(true); }}>Attach an installed world</Button>
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

      <Modal open={adding} onClose={closeAdd} eyebrow="Add world" title={`Where should ${agent.name} be examined?`}>
        <div className="flex rounded-control border border-border bg-background p-1 font-label text-label uppercase" role="tablist" aria-label="How to add a world">
          {(["draft", "attach"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              disabled={drafting}
              onClick={() => setMode(m)}
              className={`min-h-9 flex-1 cursor-pointer rounded-[4px] px-3 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${mode === m ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}
            >
              {m === "draft" ? "Draft from tools" : "Attach installed"}
            </button>
          ))}
        </div>

        {mode === "draft" ? (
          <div className="mt-5">
            <p className="text-body text-muted-foreground">
              AgentSim reads {agent.name}&apos;s {agent.tools.length || "declared"} tools and schemas, seeds a realistic company around them, and writes clean and poisoned scenarios you can replay.
            </p>
            <div className="mt-4 rounded-control border border-border bg-background p-4">
              <p className={eyebrow}>Next draft</p>
              <p className="mt-1 font-heading text-body font-semibold">{draft.name}</p>
              <p className="mt-1 text-caption text-muted-foreground">{draft.description}</p>
              <p className="mt-2 font-label text-[11px] uppercase text-muted-foreground">{draft.scenarios} scenarios · {draft.tools} tools · {draft.rows} rows</p>
            </div>
            {script.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-control border border-border bg-background" aria-live="polite">
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <span className={`${eyebrow} flex items-center gap-2`}><Icon name="terminal" className="size-3.5" /> Drafting</span>
                  <span className="font-label text-[11px] tabular-nums text-primary">{progress}%</span>
                </div>
                <ol className="space-y-1.5 px-4 py-3 font-label text-caption">
                  {script.map((s) => (
                    <li key={s.at} className={`animate-line-in flex gap-2 ${s.done ? "text-primary" : "text-foreground"}`}>
                      <span className="text-muted-foreground" aria-hidden>▸</span>
                      <span>{s.text}</span>
                    </li>
                  ))}
                  {drafting && !script.at(-1)?.done && (
                    <li className="flex items-center gap-2 text-muted-foreground"><Icon name="spinner" className="size-3.5 animate-spin" /> working…</li>
                  )}
                </ol>
                <div className="h-0.5 w-full bg-border" aria-hidden><div className="h-full bg-primary transition-[width] duration-500 ease-soft" style={{ width: `${progress}%` }} /></div>
              </div>
            )}
          </div>
        ) : available.length === 0 ? (
          <p className="mt-5 text-body text-muted-foreground">Every installed World is already attached. Draft a new one from this agent&apos;s tools instead.</p>
        ) : (
          <ul className="mt-5 flex flex-col gap-2" role="radiogroup" aria-label="Installed worlds">
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
          <LinkButton href="/worlds/new" variant="ghost" className="text-caption">Full World editor <Icon name="arrow-right" className="size-3.5" /></LinkButton>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={closeAdd}>Cancel</Button>
            {mode === "draft" ? (
              <Button onClick={draftWorld} disabled={busy}>{drafting ? "Drafting…" : <><Icon name="plus" className="size-4" /> Draft world</>}</Button>
            ) : (
              <Button onClick={attach} disabled={!choice || busy}>{busy ? "Attaching…" : "Attach world"}</Button>
            )}
          </div>
        </div>
      </Modal>

      <Toast toast={toast} onDismiss={dismiss} />
    </main>
  );
}
