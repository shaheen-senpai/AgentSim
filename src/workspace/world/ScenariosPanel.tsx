"use client";
// The Scenarios tab of a pack: generate, author a new one by hand, open one for editing, remove one.
// Authored here rather than in a section of its own because every Scenario names this World's
// entities and tools.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import { isValidScenarioId, scenarioFileKey } from "@/ui/worlds/editorLogic";
import { newScenarioFile } from "@/ui/worlds/scenarioEdits";
import { useSavePack } from "@/ui/worlds/useSavePack";
import { fieldLabel, input } from "../ui";
import type { ScenarioView } from "../worldDetail";
import { GenerateScenarios } from "./GenerateScenarios";
import { FailureNote, SaveNote } from "./SaveNote";

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ScenariosPanel({ worldId, files, scenarios, principal, base }: { worldId: string; files: Record<string, string>; scenarios: ScenarioView[]; principal: string; base: string }) {
  const router = useRouter();
  const { save, pending, errors } = useSavePack(worldId);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ id: "", title: "", brief: "", policy: "" });
  const [formError, setFormError] = useState<string | null>(null);

  const href = (id: string) => `${base}?tab=scenarios&scenario=${encodeURIComponent(id)}`;

  async function remove(id: string) {
    if (!window.confirm(`Remove Scenario "${id}" from this World? Its file is deleted.`)) return;
    const next = { ...files };
    delete next[scenarioFileKey(id)];
    await save(next);
  }

  async function create() {
    const id = form.id.trim();
    if (!isValidScenarioId(id)) return setFormError("The id must be lowercase letters, digits and hyphens, starting with a letter or digit.");
    if (scenarioFileKey(id) in files) return setFormError(`A Scenario with id "${id}" already exists.`);
    setFormError(null);
    const file = newScenarioFile({ id, title: form.title.trim() || "Untitled Scenario", taskBrief: form.brief.trim() || "Describe what the agent should accomplish.", policy: form.policy.trim() || "Describe what the agent is authorised to do.", principal });
    if (await save({ ...files, [scenarioFileKey(id)]: file })) {
      setCreating(false);
      router.push(href(id));
    }
  }

  if (creating) {
    return (
      <div className="mt-5 max-w-2xl">
        <h3 className="font-heading text-h3 font-semibold">New Scenario in this World</h3>
        <p className="mt-1 text-caption text-muted-foreground">Its Checks name this World&apos;s entities and tools; it starts with one <span className="font-label">reads_scoped</span> Check on the principal.</p>
        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor="sc-new-id" className={fieldLabel}>Scenario id</label>
            <input id="sc-new-id" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} placeholder="e.g. stolen-card-freeze" className={`${input} mt-1.5 font-label`} autoFocus />
          </div>
          <div>
            <label htmlFor="sc-new-title" className={fieldLabel}>Title</label>
            <input id="sc-new-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Reported stolen card → freeze it" className={`${input} mt-1.5`} />
          </div>
          <div>
            <label htmlFor="sc-new-brief" className={fieldLabel}>Task Brief — what the agent is asked to do</label>
            <textarea id="sc-new-brief" value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows={3} placeholder="Ticket tkt_1009 has been assigned to you. Handle it end to end." className={`${input} mt-1.5 resize-y`} />
          </div>
          <div>
            <label htmlFor="sc-new-policy" className={fieldLabel}>Mandate — what it is authorised to do</label>
            <textarea id="sc-new-policy" value={form.policy} onChange={(e) => setForm({ ...form, policy: e.target.value })} rows={4} placeholder="Every Check you add will trace back to a sentence here." className={`${input} mt-1.5 resize-y font-label text-caption`} />
          </div>
          <div className="flex gap-2">
            <Button className="min-h-10 text-caption" disabled={pending} onClick={() => void create()}>{pending ? "Creating…" : "Create Scenario"}</Button>
            <Button variant="ghost" className="min-h-10 text-caption" disabled={pending} onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </div>
        <FailureNote message={formError} />
        <SaveNote errors={errors} />
      </div>
    );
  }

  return (
    <>
      <GenerateScenarios worldId={worldId} files={files} />
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-heading text-body font-semibold">Scenarios in this World</h3>
        <Button variant="outline" className="min-h-9 text-caption" onClick={() => setCreating(true)}><Icon name="plus" className="size-3.5" /> New Scenario</Button>
      </div>
      {scenarios.length === 0 && <p className="mt-3 text-caption text-muted-foreground">No Scenarios yet, so nothing is being tested. Generate them above, or write one by hand.</p>}
      <ul className="mt-3 grid gap-3 md:grid-cols-2">
        {scenarios.map((s, i) => (
          <li key={s.id} className="animate-reveal flex flex-col rounded-panel border border-border bg-background p-4" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between gap-3">
              <span className="font-label text-label-sm uppercase text-muted-foreground">{s.id}</span>
              <span className={`font-label text-label-sm uppercase ${s.attacked ? "text-danger" : "text-safe"}`}>{s.attacked ? "Attacked" : "Clean"}</span>
            </div>
            <h4 className="mt-2 font-heading text-body font-semibold">{s.title}</h4>
            {s.brief && <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">{s.brief}</p>}
            <p className="mt-2 font-label text-[11px] text-muted-foreground">{plural(s.checks.length, "Check")} · {plural(s.attacks.length, "Attack")} · {plural(s.runs, "run")}</p>
            <div className="mt-3 flex items-center gap-3 text-caption">
              <Link href={href(s.id)} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Open &amp; edit <Icon name="arrow-right" className="size-3.5" /></Link>
              {s.runs === 0 ? (
                <button type="button" onClick={() => void remove(s.id)} disabled={pending} className="ml-auto cursor-pointer text-muted-foreground underline-offset-4 hover:text-danger hover:underline focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">Remove</button>
              ) : (
                <span className="ml-auto text-muted-foreground">Referenced by {plural(s.runs, "run")}</span>
              )}
            </div>
          </li>
        ))}
      </ul>
      <SaveNote errors={errors} />
    </>
  );
}
