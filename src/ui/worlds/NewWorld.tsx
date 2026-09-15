"use client";
// The client island for `/worlds/new` (spec §6.2): the two routes to a new World pack.
//
//   From template     copy an installed pack (or the minimal skeleton from the DSL reference),
//                     rename its id, create it. No model, no cost.
//   Generate with     name/domain/description plus whatever schema, tool list or OpenAPI the
//   Claude           customer can paste → POST /api/worlds/generate → the draft lands in the
//                     *existing* `PackEditor` with its validation errors, and a human fixes and
//                     creates it. Nothing is ever written without that review step.
//
// No value import of `@/engine/pack` — this file is a client island, so the pack format reaches it
// only as types plus the browser-safe helpers in `./editorLogic`, and everything it knows about a
// pack on disk it learns over `fetch`.
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import type { ValidationError } from "@/engine/pack";
import { field as FIELD, heading, hint as HINT, label as LABEL, mono, primaryButton as PRIMARY_BUTTON } from "@/ui/styles";
import { isValidWorldId, packField, withPackId } from "./editorLogic";
import { PackEditor } from "./PackEditor";

export type Template = { id: string; name: string };
type Mode = "template" | "generate";
type Draft = { files: Record<string, string>; errors: ValidationError[]; attempts: number };
type Outcome = { ok: boolean; errors: ValidationError[] };

const SKELETON = "__skeleton__";

/** POST /api/worlds, with the files' declared id forced to `id` so the two can never disagree. */
async function createWorld(id: string, files: Record<string, string>): Promise<Outcome & { error?: string }> {
  const body = { id, files: { ...files, "pack.yaml": withPackId(files["pack.yaml"] ?? "", id) } };
  const res = await fetch("/api/worlds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return { ok: true, errors: [] };
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: ValidationError[] };
  return { ok: false, errors: data.errors ?? [], error: data.error };
}

export function NewWorld({ templates, skeleton }: { templates: Template[]; skeleton: Record<string, string> }) {
  const router = useRouter();
  const ids = useId();
  const [mode, setMode] = useState<Mode>("template");

  return (
    <div className="flex flex-col gap-4">
      <div role="group" aria-label="How to start" className="flex gap-1">
        {(["template", "generate"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`h-8 rounded px-3 text-[13px] border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] ${
              mode === m ? "bg-[#1d1d1b] text-white border-[#1d1d1b] font-semibold" : "bg-white text-[#6b6b66] border-[#cfcfcb] hover:text-[#1d1d1b]"
            }`}
          >
            {m === "template" ? "From template" : "Generate with Claude"}
          </button>
        ))}
      </div>

      {mode === "template" ? (
        <FromTemplate ids={ids} templates={templates} skeleton={skeleton} onCreated={(id) => router.push(`/worlds/${id}`)} />
      ) : (
        <GenerateWithClaude ids={ids} onCreated={(id) => router.push(`/worlds/${id}`)} />
      )}
    </div>
  );
}

// ───────────────────────────── From template ─────────────────────────────

function FromTemplate({
  ids,
  templates,
  skeleton,
  onCreated,
}: {
  ids: string;
  templates: Template[];
  skeleton: Record<string, string>;
  onCreated: (id: string) => void;
}) {
  const [source, setSource] = useState<string>(templates[0]?.id ?? SKELETON);
  const [id, setId] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<ValidationError[]>([]);

  const idOk = isValidWorldId(id);

  async function handleCreate() {
    setMessage(null);
    setErrors([]);
    if (!idOk) {
      setMessage("Give the new World an id of 2–41 characters: lowercase letters, digits and hyphens, starting with a letter or digit.");
      return;
    }
    setPending(true);
    try {
      let files = skeleton;
      if (source !== SKELETON) {
        const res = await fetch(`/api/worlds/${source}`);
        if (!res.ok) {
          setMessage(`Could not read the template '${source}'.`);
          return;
        }
        const data = (await res.json()) as { pack: { files: Record<string, string> } };
        files = data.pack.files;
      }
      const outcome = await createWorld(id, files);
      if (outcome.ok) {
        onCreated(id);
        return;
      }
      setMessage(outcome.error ?? "The copy did not validate — see below.");
      setErrors(outcome.errors);
    } catch {
      setMessage("Network error — nothing was created.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bg-white border border-[#cfcfcb] rounded p-3 flex flex-col gap-3 max-w-[620px]">
      <h2 className={heading}>Copy an existing pack</h2>
      <p className="text-[12px] text-[#6b6b66]">
        The fastest way to a working World: take a pack that already validates and edit it into the domain you want.
      </p>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-source`} className={LABEL}>
          Start from
        </label>
        <select id={`${ids}-source`} value={source} onChange={(e) => setSource(e.target.value)} className={FIELD}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.id})
            </option>
          ))}
          <option value={SKELETON}>Minimal skeleton — two entities, five tools, one Scenario</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-id`} className={LABEL}>
          New World id
        </label>
        <input
          id={`${ids}-id`}
          value={id}
          onChange={(e) => setId(e.target.value)}
          placeholder="halvard-helpdesk"
          spellCheck={false}
          aria-describedby={`${ids}-id-hint`}
          aria-invalid={id.length > 0 && !idOk}
          className={`${FIELD} ${mono}`}
        />
        <p id={`${ids}-id-hint`} className={HINT}>
          Lowercase letters, digits and hyphens. This is the folder under <span className={mono}>worldpacks/</span> and the URL of the World.
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" onClick={handleCreate} disabled={pending} className={PRIMARY_BUTTON}>
          Create world
        </button>
        {pending && <span className="text-[12px] text-[#6b6b66]">Creating…</span>}
      </div>

      <div role="status" aria-live="polite" className="text-[12px] empty:hidden">
        {message && <p className="text-[#c8321e] font-semibold">{message}</p>}
        {errors.length > 0 && (
          <ul className="mt-1 flex flex-col gap-0.5 border border-[#c8321e] bg-[#fbeeea] rounded p-2">
            {errors.map((e, i) => (
              <li key={i} className="text-[11px] text-[#c8321e]">
                <span className={`${mono} font-semibold`}>{e.file}</span>
                {e.path ? <span className={mono}> · {e.path}</span> : null} — {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ───────────────────────────── Generate with Claude ─────────────────────────────

const TEXTAREA_ROWS = 6;

function GenerateWithClaude({ ids, onCreated }: { ids: string; onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [description, setDescription] = useState("");
  const [schema, setSchema] = useState("");
  const [tools, setTools] = useState("");
  const [openapi, setOpenapi] = useState("");

  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [failure, setFailure] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [generation, setGeneration] = useState(0); // remounts the editor so a new draft replaces the old one
  const [worldId, setWorldId] = useState("");

  const formOk = name.trim() !== "" && domain.trim() !== "" && description.trim() !== "";

  // A generation runs for a minute or two; the counter is the only sign the request is still alive.
  useEffect(() => {
    if (!running) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!formOk || running) return;
    setRunning(true);
    setElapsed(0);
    setFailure(null);
    setDraft(null);
    try {
      const res = await fetch("/api/worlds/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, domain, description, schema, tools, openapi }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<Draft> & { error?: string };
      if (!res.ok || !data.files) {
        setFailure(data.error ?? `Generation failed (HTTP ${res.status}).`);
        return;
      }
      const next: Draft = { files: data.files, errors: data.errors ?? [], attempts: data.attempts ?? 1 };
      setDraft(next);
      setGeneration((n) => n + 1);
      setWorldId(packField(next.files["pack.yaml"] ?? "", "id") ?? "");
    } catch {
      setFailure("Network error — nothing was generated.");
    } finally {
      setRunning(false);
    }
  }

  async function submitDraft(files: Record<string, string>): Promise<Outcome> {
    const outcome = await createWorld(worldId, files);
    if (outcome.ok) {
      onCreated(worldId);
      return { ok: true, errors: [] };
    }
    return {
      ok: false,
      errors: outcome.errors.length > 0 ? outcome.errors : [{ file: "pack.yaml", path: "", message: outcome.error ?? "The World was not created." }],
    };
  }

  const idOk = isValidWorldId(worldId);

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={handleGenerate} className="bg-white border border-[#cfcfcb] rounded p-3 flex flex-col gap-3 max-w-[820px]">
        <h2 className={heading}>Describe the domain</h2>
        <p className="text-[12px] text-[#6b6b66]">
          Claude reads the World pack format and drafts the entities, the ownership map, a small synthetic Seed, the tools with their guards, and a
          first Scenario with an Attack. Paste a schema, a tool list or an OpenAPI spec and it reads the real shape instead of guessing —{" "}
          <strong className="font-semibold text-[#1d1d1b]">schema only, never real data</strong>. You review the draft before anything is created.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-name`} className={LABEL}>
              Name
            </label>
            <input id={`${ids}-name`} value={name} onChange={(e) => setName(e.target.value)} required placeholder="Halvard Helpdesk" className={FIELD} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={`${ids}-domain`} className={LABEL}>
              Domain
            </label>
            <input id={`${ids}-domain`} value={domain} onChange={(e) => setDomain(e.target.value)} required placeholder="it-helpdesk" className={`${FIELD} ${mono}`} />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={`${ids}-description`} className={LABEL}>
            What the business does, and what the agent is there to do
          </label>
          <textarea
            id={`${ids}-description`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            required
            rows={3}
            placeholder="An internal IT helpdesk. Employees raise tickets; the agent triages them, grants software access within its remit and books device swaps."
            className={FIELD}
          />
        </div>

        <details className="border border-[#e6e6e2] rounded p-2">
          <summary className="text-[12px] font-semibold cursor-pointer">Source material (optional, but it is what makes the pack yours)</summary>
          <div className="pt-2 flex flex-col gap-3">
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-schema`} className={LABEL}>
                Database schema — DDL, an ORM schema, migrations
              </label>
              <textarea id={`${ids}-schema`} value={schema} onChange={(e) => setSchema(e.target.value)} rows={TEXTAREA_ROWS} spellCheck={false} className={`${FIELD} ${mono} text-[12px]`} />
              <p className={HINT}>Schema only. Never paste production rows.</p>
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-tools`} className={LABEL}>
                The agent&rsquo;s tools — a <span className={mono}>tools/list</span> response, or one per line
              </label>
              <textarea id={`${ids}-tools`} value={tools} onChange={(e) => setTools(e.target.value)} rows={TEXTAREA_ROWS} spellCheck={false} className={`${FIELD} ${mono} text-[12px]`} />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={`${ids}-openapi`} className={LABEL}>
                OpenAPI specification
              </label>
              <textarea id={`${ids}-openapi`} value={openapi} onChange={(e) => setOpenapi(e.target.value)} rows={TEXTAREA_ROWS} spellCheck={false} className={`${FIELD} ${mono} text-[12px]`} />
            </div>
          </div>
        </details>

        <div className="flex items-center gap-2">
          <button type="submit" disabled={!formOk || running} className={PRIMARY_BUTTON}>
            {running ? "Generating…" : draft ? "Generate again" : "Generate"}
          </button>
          {!formOk && <span className={HINT}>Name, domain and description are required.</span>}
        </div>
      </form>

      <div role="status" aria-live="polite" className="text-[12px] max-w-[820px] empty:hidden">
        {running && (
          <p className="border border-[#cfcfcb] bg-white rounded p-2">
            Drafting the World pack with Claude — this usually takes a minute or two, and up to two attempts if the first draft does not validate.{" "}
            <span className={mono}>{elapsed}s</span>
          </p>
        )}
        {failure && !running && <p className="border border-[#c8321e] bg-[#fbeeea] rounded p-2 text-[#c8321e] font-semibold">{failure}</p>}
        {draft && !running && (
          <p className="border border-[#cfcfcb] bg-white rounded p-2">
            Draft ready after {draft.attempts} {draft.attempts === 1 ? "attempt" : "attempts"}.{" "}
            {draft.errors.length === 0 ? (
              <span className="text-[#2f7d4f] font-semibold">It validates.</span>
            ) : (
              <span className="text-[#c8321e] font-semibold">
                {draft.errors.length} {draft.errors.length === 1 ? "error" : "errors"} left to fix below.
              </span>
            )}{" "}
            Read it, fix what is wrong, then create it.
          </p>
        )}
      </div>

      {draft && (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 max-w-[420px]">
            <label htmlFor={`${ids}-draft-id`} className={LABEL}>
              New World id
            </label>
            <input
              id={`${ids}-draft-id`}
              value={worldId}
              onChange={(e) => setWorldId(e.target.value)}
              spellCheck={false}
              aria-describedby={`${ids}-draft-id-hint`}
              aria-invalid={worldId.length > 0 && !idOk}
              className={`${FIELD} ${mono}`}
            />
            <p id={`${ids}-draft-id-hint`} className={HINT}>
              {idOk ? "Create writes the pack to worldpacks/" + worldId + "." : "Lowercase letters, digits and hyphens, 2–41 characters."}
            </p>
          </div>
          <PackEditor
            key={generation}
            worldId={worldId}
            principal={packField(draft.files["pack.yaml"] ?? "", "principal") ?? ""}
            initialTab="overview"
            files={draft.files}
            draft={{ submitLabel: "Create world", submit: submitDraft, canSubmit: idOk, initialErrors: draft.errors }}
          />
        </section>
      )}
    </div>
  );
}
