"use client";
// `/agents/new` — describe an agent by hand. The card on the right is the agent as it will appear
// in the list, updating as you type, so there is no surprise on save.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import type { AgentShape } from "@/ui/types";
import type { Agent } from "@/ui/types";
import { AgentCard } from "./AgentCard";
import { createAgent, lines } from "./api";
import { container, eyebrow, fieldLabel, hint, input } from "./ui";

const SHAPES: { value: AgentShape; label: string; help: string }[] = [
  { value: "mcp", label: "MCP client", help: "It calls our tools over MCP." },
  { value: "forwarder", label: "Forwarder", help: "It posts tool calls to our HTTP endpoint." },
  { value: "connector", label: "Connector", help: "We call its tools." },
];

export function CreateAgentForm() {
  const router = useRouter();
  const id = useId();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [mandate, setMandate] = useState("");
  const [tools, setTools] = useState("");
  const [entities, setEntities] = useState("");
  const [shape, setShape] = useState<AgentShape>("mcp");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const nameError = touched && name.trim() === "" ? "Give the agent a name." : null;

  const preview: Agent = {
    id: "preview",
    name: name.trim(),
    version: "1.0",
    shape,
    toolAliases: {},
    url: "",
    authHeaderEnv: "",
    notes: "",
    createdAt: "",
    source: "manual",
    description: description.trim(),
    mandate: mandate.trim(),
    tools: lines(tools),
    entities: lines(entities),
    worldIds: [],
    worlds: [],
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (name.trim() === "") return;
    setBusy(true);
    setError(null);
    // The preview carries a placeholder id and createdAt; the API assigns the real ones.
    const { id: _id, createdAt: _createdAt, ...body } = preview;
    void _id;
    void _createdAt;
    const result = await createAgent({ ...body, notes: "Created by hand" });
    if (result.agent === null) {
      setError(result.error);
      setBusy(false);
      return;
    }
    router.push(`/agents/${result.agent.id}`);
  };

  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <Link href="/agents" className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> All agents
      </Link>
      <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <form onSubmit={submit} noValidate className="animate-reveal">
          <p className={eyebrow}>Workspace</p>
          <h1 className="mt-2 font-heading text-display font-semibold">Create agent</h1>
          <p className="mt-3 max-w-xl text-body text-muted-foreground">Tools and entities are one per line. You can attach Worlds afterwards.</p>

          <div className="mt-8 flex flex-col gap-5">
            <div>
              <label htmlFor={`${id}-name`} className={fieldLabel}>Name</label>
              <input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setTouched(true)} aria-invalid={!!nameError} aria-describedby={nameError ? `${id}-name-err` : undefined} className={`${input} mt-1.5 ${nameError ? "border-danger" : ""}`} placeholder="Refund Desk" autoFocus />
              {nameError && <p id={`${id}-name-err`} className="mt-1 text-caption text-danger">{nameError}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-desc`} className={fieldLabel}>Description</label>
              <textarea id={`${id}-desc`} value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className={`${input} mt-1.5 resize-y`} placeholder="Handles refund and chargeback requests across email and chat." />
            </div>
            <div>
              <label htmlFor={`${id}-mandate`} className={fieldLabel}>Mandate</label>
              <textarea id={`${id}-mandate`} value={mandate} onChange={(e) => setMandate(e.target.value)} rows={2} className={`${input} mt-1.5 resize-y font-label text-caption`} placeholder="Never alter a payout method. Escalate any mismatch." />
              <p className={hint}>The authority boundary the agent must respect. Violations are graded against it.</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor={`${id}-tools`} className={fieldLabel}>Tools</label>
                <textarea id={`${id}-tools`} value={tools} onChange={(e) => setTools(e.target.value)} rows={5} className={`${input} mt-1.5 resize-y font-label text-caption`} placeholder={"orders.read\nrefunds.create\npayments.verify"} />
                <p className={hint}>{preview.tools.length} tool{preview.tools.length === 1 ? "" : "s"}</p>
              </div>
              <div>
                <label htmlFor={`${id}-entities`} className={fieldLabel}>Entities</label>
                <textarea id={`${id}-entities`} value={entities} onChange={(e) => setEntities(e.target.value)} rows={5} className={`${input} mt-1.5 resize-y font-label text-caption`} placeholder={"Order\nRefund\nCard"} />
                <p className={hint}>{preview.entities.length} entit{preview.entities.length === 1 ? "y" : "ies"}</p>
              </div>
            </div>
            <fieldset>
              <legend className={fieldLabel}>How it connects</legend>
              <div className="mt-1.5 grid gap-2 sm:grid-cols-3">
                {SHAPES.map((s) => (
                  <label key={s.value} className={`cursor-pointer rounded-control border px-3 py-2.5 transition-colors duration-200 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring ${shape === s.value ? "border-primary/60 bg-primary/10" : "border-border hover:border-primary/40"}`}>
                    <input type="radio" name="shape" value={s.value} checked={shape === s.value} onChange={() => setShape(s.value)} className="sr-only" />
                    <span className="block text-body font-medium">{s.label}</span>
                    <span className="mt-0.5 block text-caption text-muted-foreground">{s.help}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </div>

          {error && <p role="alert" className="mt-5 flex items-start gap-2 rounded-control border border-danger/50 bg-danger/10 px-3 py-2 text-caption text-danger"><Icon name="alert" className="mt-0.5 size-4 shrink-0" /> {error}</p>}

          <div className="mt-8 flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>{busy ? "Saving…" : "Create agent"} <Icon name="arrow-right" className="size-4" /></Button>
            <Link href="/agents" className="inline-flex min-h-11 items-center rounded-control px-4 text-body text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Cancel</Link>
          </div>
        </form>

        <aside className="animate-reveal lg:pt-24 [animation-delay:150ms]" aria-label="Preview">
          <p className={eyebrow}>Preview</p>
          <div className="mt-3 max-w-md">
            <AgentCard agent={preview} activity={{ runs: 0, trust: null }} />
          </div>
          <p className={hint}>This is how it will appear in your agents list.</p>
        </aside>
      </div>
    </main>
  );
}
