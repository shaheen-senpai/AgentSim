"use client";
// One wizard for the two things you create in the workspace. An agent and a World are composed
// from the same sources — shadowed MCP providers, your own tools, a schema, a pack — so the flow is
// the same: How → Compose → Review. `target` decides the copy, the fields and what gets saved.
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { Agent } from "@/ui/types";
import { agentTrust } from "../agentStats";
import { createAgent, updateAgent } from "../api";
import type { HandshakeStep } from "../handshake";
import { eyebrow, fieldLabel, hint, input, tag } from "../ui";
import { buildWorldDraftScript, newWorldId, nextDraftWorld } from "../worlds";
import {
  HOW_OPTIONS, stepLabels, buildAgentCreateScript, canContinue, composedEntities, composedTools, worldDraftFromComposition,
  type How, type PackPick, type ProviderInfo, type Source, type Target,
} from "./composeModel";
import { PackTiles, SourceComposer } from "./SourceComposer";
import { PluginGenerate, type PluginDraft } from "./PluginGenerate";
import { agentFromDraft } from "./draftAgent";
import { draftEntities, draftTools } from "@/ui/worlds/newWorld/draftView";
import { isValidWorldId, withPackId } from "@/ui/worlds/editorLogic";
import { slugify } from "@/ui/worlds/newWorld/sources";
import { WizardShell } from "./WizardShell";

type Props = { target: Target; providers: ProviderInfo[]; packs: PackPick[]; agent?: Agent; initialHow?: How | null };

const COPY: Record<Target, { title: string; lead: string; noun: "Agent" | "World" }> = {
  agent: {
    title: "New agent",
    lead: "An agent is everything it can reach and the mandate it must obey — several third-party MCPs, your own tool definitions, a database. Connect it through the plugin, or compose it yourself; either way it ends in the same registry with one tool surface.",
    noun: "Agent",
  },
  world: {
    title: "New world",
    lead: "A World is the union of everything the agent can reach — several third-party MCPs, your own tool definitions, a database. Compose it yourself, or let AgentSim draft it from the agent's tools; either way it ends in the same sandbox with one ownership graph.",
    noun: "World",
  },
};

export function CreateWizard({ target, providers, packs, agent, initialHow = null }: Props) {
  const router = useRouter();
  const id = useId();
  const copy = COPY[target];
  const [step, setStep] = useState(initialHow ? 1 : 0);
  const [how, setHow] = useState<How | null>(initialHow);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mandate, setMandate] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [packId, setPackId] = useState<string | null>(null);
  const [pluginDraft, setPluginDraft] = useState<PluginDraft | null>(null);
  const [script, setScript] = useState<HandshakeStep[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Where the created thing lives, once it is saved — shown as a link in case the redirect does not land. */
  const [created, setCreated] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  // Handshake timers outlive a navigation away from the wizard unless cleared here.
  useEffect(() => () => { for (const t of timers.current) window.clearTimeout(t); }, []);

  /**
   * The save has happened; go to what was made. A soft push first (keeps the workspace shell), and
   * a hard navigation if the page is still here a moment later — the push has been seen to be
   * dropped now and then, leaving the wizard on Review with the agent already in the registry.
   */
  const go = (href: string) => {
    setCreated(href);
    router.push(href);
    timers.current.push(window.setTimeout(() => window.location.assign(href), 2500));
  };

  const tools = useMemo(() => composedTools(sources, providers), [sources, providers]);
  const entities = useMemo(() => composedEntities(sources), [sources]);
  const draft = useMemo(() => (agent ? nextDraftWorld(agent) : null), [agent]);
  const composedWorld = useMemo(() => worldDraftFromComposition(name, description, sources, providers, packs, { entities, mandate }), [name, description, sources, providers, packs, entities, mandate]);
  const chosenPack = packs.find((p) => p.id === packId) ?? null;
  const ok = canContinue(step, how, { name, sources, packId, hasDraft: pluginDraft !== null });
  const steps = stepLabels(how);

  const back = target === "agent" ? { label: "All agents", href: "/agents" } : { label: agent?.name ?? "Agent", href: `/agents/${agent?.id}` };
  const crumbs = target === "agent" ? [{ label: "Agents", href: "/agents" }, { label: "New agent" }] : [{ label: "Agents", href: "/agents" }, { label: agent?.name ?? "Agent", href: `/agents/${agent?.id}` }, { label: "New world" }];

  const next = () => {
    if (step === 0) {
      if (how === "draft") return setStep(2);
      return setStep(1);
    }
    if (step === 1) return setStep(2);
  };
  const previous = () => {
    if (step === 2 && how === "plugin") setPluginDraft(null);
    setStep((s) => (s === 2 && how === "draft" ? 0 : Math.max(0, s - 1)));
  };

  const play = (steps: HandshakeStep[], onDone: () => Promise<void>) => {
    for (const t of timers.current) window.clearTimeout(t);
    timers.current = [];
    setScript([]);
    setBusy(true);
    setError(null);
    for (const s of steps) {
      timers.current.push(
        window.setTimeout(async () => {
          setScript((cur) => [...cur, s]);
          if (s.done) await onDone();
        }, s.at),
      );
    }
  };

  const fail = (message: string) => {
    setError(message);
    setBusy(false);
  };

  /** The draft becomes a World on disk (built by the plugin), and for an agent import, the agent too. */
  const createFromPluginDraft = (d: PluginDraft) => {
    const worldId = slugify(d.input.name) || `world-${Date.now().toString(36)}`;
    if (!isValidWorldId(worldId)) return fail("The draft's name does not make a valid World id.");
    const files = { ...d.files, "pack.yaml": withPackId(d.files["pack.yaml"] ?? "", worldId) };
    const builtBy = { source: "plugin" as const, ...(d.token ? { token: d.token } : {}), ...(d.client ? { client: d.client } : {}), ...(d.repo ? { repo: d.repo } : {}) };
    const steps: HandshakeStep[] = target === "agent"
      ? [{ text: `creating World ${worldId} from draft ${d.id}`, at: 0 }, { text: `registering ${d.input.name} with ${draftTools(d.files).length} tools`, at: 800 }, { text: `imported ${d.input.name}`, at: 1400, done: true }]
      : [{ text: `creating World ${worldId} from draft ${d.id}`, at: 0 }, { text: `attaching it to ${agent?.name}`, at: 700 }, { text: `created ${d.input.name}`, at: 1200, done: true }];
    return play(steps, async () => {
      const res = await fetch("/api/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: worldId, files, builtBy }) });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: { file: string; path: string; message: string }[] };
        return fail(data.error ?? (data.errors?.length ? `${data.errors.length} validation error${data.errors.length === 1 ? "" : "s"}: ${data.errors.map((e) => `${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`).join(" · ")}` : `The World was not created (HTTP ${res.status}).`));
      }
      if (target === "agent") {
        const result = await createAgent(agentFromDraft(d, worldId));
        if (result.agent === null) return fail(result.error);
        return go(`/agents/${result.agent.id}?fresh=${worldId}`);
      }
      if (!agent) return;
      const result = await updateAgent({ ...agent, worldIds: [...agent.worldIds, worldId] });
      if (result.agent === null) return fail(result.error);
      go(`/agents/${agent.id}?fresh=${worldId}`);
    });
  };

  const create = () => {
    if (how === "plugin" && pluginDraft) return createFromPluginDraft(pluginDraft);
    if (target === "agent") {
      // The same sources that describe the agent seed its first World, so the agent page has one to open.
      const firstWorld = { ...worldDraftFromComposition(`${name.trim()} World`, description, sources, providers, packs, { entities, mandate: mandate.trim() }), id: newWorldId(), createdAt: new Date().toISOString() };
      const body = { name: name.trim(), version: "1.0", shape: "mcp" as const, toolAliases: {}, notes: "Composed in the workspace", source: "manual" as const, description: description.trim(), mandate: mandate.trim(), tools, entities, worldIds: [], worlds: [firstWorld] };
      return play(buildAgentCreateScript(body.name, tools.length), async () => {
        const result = await createAgent(body);
        if (result.agent === null) return fail(result.error);
        go(`/agents/${result.agent.id}?fresh=${firstWorld.id}`);
      });
    }
    if (!agent) return;
    if (how === "attach" && chosenPack) {
      return play([{ text: `attaching ${chosenPack.name}`, at: 0 }, { text: `attached ${chosenPack.name}`, at: 500, done: true }], async () => {
        const result = await updateAgent({ ...agent, worldIds: [...agent.worldIds, chosenPack.id] });
        if (result.agent === null) return fail(result.error);
        go(`/agents/${agent.id}?fresh=${chosenPack.id}`);
      });
    }
    const world = { ...(how === "draft" && draft ? draft : composedWorld), id: newWorldId(), createdAt: new Date().toISOString() };
    return play(buildWorldDraftScript(world.name, world.tools), async () => {
      const result = await updateAgent({ ...agent, worlds: [world, ...agent.worlds] });
      if (result.agent === null) return fail(result.error);
      go(`/agents/${agent.id}?fresh=${world.id}`);
    });
  };

  const footer = (
    <>
      <Button variant="ghost" onClick={previous} disabled={step === 0 || busy} className={step === 0 ? "invisible" : ""}>
        <Icon name="arrow-left" className="size-4" /> Back
      </Button>
      {step < 2 ? (
        <Button onClick={next} disabled={!ok}>
          Continue <Icon name="arrow-right" className="size-4" />
        </Button>
      ) : (
        <Button onClick={create} disabled={busy || (how === "plugin" ? !pluginDraft || pluginDraft.errors.length > 0 : target === "agent" && !name.trim())}>
          {busy ? (how === "plugin" ? (target === "agent" ? "Importing…" : "Creating…") : target === "agent" ? "Creating…" : how === "attach" ? "Attaching…" : "Drafting…") : how === "plugin" && target === "agent" ? "Import agent" : `Create ${copy.noun}`}
        </Button>
      )}
    </>
  );

  return (
    <>
      <WizardShell back={back} crumbs={crumbs} title={copy.title} lead={copy.lead} steps={steps} current={step} footer={footer}>
        {step === 0 && (
          <div>
            <h2 className="font-heading text-h3 font-semibold">How do you want to build it?</h2>
            <ul className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="How">
              {HOW_OPTIONS[target].map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={how === o.id}
                    onClick={() => setHow(o.id)}
                    className={`flex h-full w-full cursor-pointer flex-col rounded-panel border p-5 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${how === o.id ? "border-primary/70 bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}
                  >
                    <span className="flex items-start justify-between gap-3">
                      <span className="font-heading text-body font-semibold">{o.title}</span>
                      {o.badge && <span className="shrink-0 rounded-full border border-primary/40 px-2 py-0.5 font-label text-[10px] uppercase text-primary">{o.badge}</span>}
                    </span>
                    <span className="mt-2 text-caption text-muted-foreground">{o.body}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {step === 1 && how === "plugin" && (
          <PluginGenerate agentName={agent?.name ?? "this agent"} onReview={(d) => { setPluginDraft(d); setStep(2); }} />
        )}

        {step === 1 && how === "attach" && (
          <div>
            <h2 className="font-heading text-h3 font-semibold">Pick an installed World</h2>
            <div className="mt-4"><PackTiles packs={packs.filter((p) => !agent?.worldIds.includes(p.id))} selected={packId} onSelect={setPackId} /></div>
          </div>
        )}

        {step === 1 && how === "compose" && (
          <div className="flex flex-col gap-8">
            <div className="grid gap-5 md:grid-cols-2">
              <div className="md:col-span-2">
                <label htmlFor={`${id}-name`} className={fieldLabel}>Name</label>
                <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1.5`} placeholder={target === "agent" ? "Refund Desk" : "Ridgeway Payments"} autoFocus />
              </div>
              <div className={target === "agent" ? "" : "md:col-span-2"}>
                <label htmlFor={`${id}-desc`} className={fieldLabel}>Description</label>
                <textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className={`${input} mt-1.5 resize-y`} placeholder={target === "agent" ? "Handles refund and chargeback requests across email and chat." : "A payments back office at month-end: refunds, chargebacks and a payout rail that only checks the last four digits."} />
              </div>
              {target === "agent" && (
                <div>
                  <label htmlFor={`${id}-mandate`} className={fieldLabel}>Mandate</label>
                  <textarea id={`${id}-mandate`} value={mandate} onChange={(e) => setMandate(e.target.value)} rows={3} className={`${input} mt-1.5 resize-y font-label text-caption`} placeholder="Never alter a payout method. Escalate any mismatch." />
                  <p className={hint}>The authority boundary violations are graded against.</p>
                </div>
              )}
            </div>
            <div className="border-t border-border pt-8">
              <SourceComposer subject={copy.noun} sources={sources} onChange={setSources} providers={providers} packs={packs} allowPack={target === "world"} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h2 className="font-heading text-h3 font-semibold">Review the {copy.noun}</h2>
            {how === "plugin" && pluginDraft ? (
              <>
                <Summary
                  rows={[
                    ["World", pluginDraft.input.name],
                    ["Domain", pluginDraft.input.domain],
                    ["Description", pluginDraft.input.description],
                    ["Draft", `${pluginDraft.id}${pluginDraft.repo ? ` · ${pluginDraft.repo}` : ""}${pluginDraft.client ? ` · ${pluginDraft.client}` : ""}`],
                    ["Shape", `${draftTools(pluginDraft.files).length} tools · ${draftEntities(pluginDraft.files).length} entities`],
                    ["Validation", pluginDraft.errors.length === 0 ? "Valid — created as a draft World, published once it has Scenarios" : `${pluginDraft.errors.length} error${pluginDraft.errors.length === 1 ? "" : "s"}`],
                    ...(target === "agent" ? ([["Agent", `${pluginDraft.input.name} · registered from this draft, attached to the World`]] as [string, string][]) : []),
                  ]}
                />
                {pluginDraft.errors.length > 0 && (
                  <ul className="mt-4 flex flex-col gap-1 rounded-control border border-danger/40 bg-danger/10 px-4 py-3 font-label text-caption text-danger">
                    {pluginDraft.errors.map((e, i) => <li key={i}>{e.file}{e.path ? ` · ${e.path}` : ""}: {e.message}</li>)}
                  </ul>
                )}
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <TagBlock label={`Tools · ${draftTools(pluginDraft.files).length}`} items={draftTools(pluginDraft.files).map((t) => t.name)} />
                  <TagBlock label={`Entities · ${draftEntities(pluginDraft.files).length}`} items={draftEntities(pluginDraft.files).map((e) => e.name)} />
                </div>
              </>
            ) : how === "draft" && draft ? (
              <Summary rows={[["Name", draft.name], ["Domain", draft.domain], ["Description", draft.description], ["Built from", `${agent?.tools.length ?? 0} of ${agent?.name}'s tools`], ["Shape", `${draft.scenarios} scenarios · ${draft.tools} tools · ${draft.rows} rows`]]} />
            ) : how === "attach" && chosenPack ? (
              <Summary rows={[["World", chosenPack.name], ["Domain", chosenPack.domain], ["Description", chosenPack.description], ["Shape", `${chosenPack.entities} entities · ${chosenPack.tools} tools`]]} />
            ) : (
              <>
                <Summary
                  rows={[
                    ["Name", name.trim() || "—"],
                    ["Description", description.trim() || "—"],
                    ...(target === "agent" ? ([["Mandate", mandate.trim() || "—"]] as [string, string][]) : ([["Domain", composedWorld.domain], ["Shape", `${composedWorld.scenarios} scenarios · ${composedWorld.tools} tools · ${composedWorld.rows} rows`]] as [string, string][])),
                    ["Sources", `${sources.length}`],
                  ]}
                />
                <div className="mt-5 grid gap-5 sm:grid-cols-2">
                  <TagBlock label={`Tools · ${tools.length}`} items={tools} />
                  <TagBlock label={`Entities · ${entities.length}`} items={entities} empty="None from these sources; add a database schema to name them." />
                </div>
              </>
            )}
            {target === "agent" && how !== "plugin" && (
              <p className={`${hint} mt-4`}>Trust starts empty: {agentTrust("none", []).runs} shifts have run. Attach a World from the agent page to start the first one.</p>
            )}
            {script.length > 0 && (
              <div className="mt-6 overflow-hidden rounded-control border border-border bg-background" aria-live="polite">
                <div className="flex items-center justify-between border-b border-border px-4 py-2">
                  <span className={`${eyebrow} flex items-center gap-2`}><Icon name="terminal" className="size-3.5" /> {how === "plugin" ? (target === "agent" ? "Importing" : "Creating") : target === "agent" ? "Registering" : how === "attach" ? "Attaching" : "Drafting"}</span>
                </div>
                <ol className="space-y-1.5 px-4 py-3 font-label text-caption">
                  {script.map((s) => (
                    <li key={s.at} className={`animate-line-in flex gap-2 ${s.done ? "text-primary" : "text-foreground"}`}><span className="text-muted-foreground" aria-hidden>▸</span><span>{s.text}</span></li>
                  ))}
                  {busy && !script.at(-1)?.done && <li className="flex items-center gap-2 text-muted-foreground"><Icon name="spinner" className="size-3.5 animate-spin" /> working…</li>}
                  {created && (
                    <li className="flex items-center gap-2 text-muted-foreground">
                      <Icon name="spinner" className="size-3.5 animate-spin" /> opening it…{" "}
                      <Link href={created} className="text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">open the {copy.noun.toLowerCase()} →</Link>
                    </li>
                  )}
                </ol>
              </div>
            )}
            {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-control border border-danger/50 bg-danger/10 px-3 py-2 text-caption text-danger"><Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {error}</p>}
          </div>
        )}
      </WizardShell>

    </>
  );
}

function Summary({ rows }: { rows: [string, string][] }) {
  return (
    <dl className="mt-4 divide-y divide-border rounded-panel border border-border bg-background">
      {rows.map(([k, v]) => (
        <div key={k} className="grid gap-1 px-5 py-3 sm:grid-cols-[160px_1fr]">
          <dt className={eyebrow}>{k}</dt>
          <dd className="text-body">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function TagBlock({ label, items, empty = "None yet." }: { label: string; items: string[]; empty?: string }) {
  return (
    <div>
      <p className={eyebrow}>{label}</p>
      <ul className="mt-2 flex flex-wrap gap-1.5">
        {items.map((t) => <li key={t} className={tag}>{t}</li>)}
        {items.length === 0 && <li className="text-caption text-muted-foreground">{empty}</li>}
      </ul>
    </div>
  );
}
