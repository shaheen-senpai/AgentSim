"use client";
// The New world flow (design/agentsim-console.html `renderNewWorld` 2001-2245): How → Compose or
// Generate → Review. Composed sources feed `POST /api/worlds/generate`; a copied pack is created
// as-is; a worldbuilder draft (from `/mcp/worlds`) is reviewed and created. Nothing is written
// until "Create World".
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useState } from "react";
import type { ValidationError } from "@/engine/pack";
import type { DraftSummary } from "@/lib/draftSummary";
import { CopyButton } from "@/ui/connect/CopyButton";
import { relativeTime } from "@/ui/relativeTime";
import { systemColor } from "@/ui/systemColor";
import { useOrigin } from "@/ui/useOrigin";
import { isValidWorldId, withPackId } from "../editorLogic";
import { draftEntities, draftScenario, draftTools } from "./draftView";
import { FORMAT_LABEL, isCopyOnly, slugify, SRC_KIND, srcLabel, srcMode, srcToolCount, toGenerateInput, type PackPick, type ProviderInfo, type ReviewFields, type Source } from "./sources";

export type DraftForReview = { id?: string; files: Record<string, string>; errors: ValidationError[]; input?: { name: string; domain: string; description: string } };

export type NewWorldProps = { providers: ProviderInfo[]; packs: PackPick[]; drafts: DraftSummary[]; initialDraft: DraftForReview | null; now: number };

type Adding = "mcp" | "tools" | "db" | "pack";
type Format = Extract<Source, { kind: "tools" }>["format"];

const ADD_TYPES: [Adding, string][] = [["mcp", "+ Third-party MCP"], ["tools", "+ Your own tools"], ["db", "+ Database"], ["pack", "+ Copy a pack"]];
const WB_TOOLS = ["register_agent", "get_world_draft", "refine_world", "create_world"];

const PASTE_SAMPLES: Record<Format, string> = {
  mcp: '[\n  { "name": "get_invoice",\n    "description": "Fetch an invoice by id.",\n    "inputSchema": { "type": "object",\n      "properties": { "invoice_id": { "type": "string" } },\n      "required": ["invoice_id"] } },\n  { "name": "issue_credit_note",\n    "description": "Credit an invoice, in minor units.",\n    "inputSchema": { "type": "object",\n      "properties": { "invoice_id": { "type": "string" },\n                      "amount_minor": { "type": "integer" } },\n      "required": ["invoice_id", "amount_minor"] } }\n]',
  openapi: "paths:\n  /invoices/{invoice_id}:\n    get:\n      operationId: getInvoice\n      parameters:\n        - name: invoice_id\n          in: path\n          required: true\n          schema: { type: string }\n  /invoices/{invoice_id}/credit_notes:\n    post:\n      operationId: issueCreditNote\n      requestBody:\n        content:\n          application/json:\n            schema:\n              properties:\n                amount_minor: { type: integer }",
  ts: 'export const tools = [\n  {\n    name: "get_invoice",\n    description: "Fetch an invoice by id.",\n    input: z.object({ invoice_id: z.string() })\n  },\n  {\n    name: "issue_credit_note",\n    description: "Credit an invoice, in minor units.",\n    input: z.object({\n      invoice_id: z.string(),\n      amount_minor: z.number().int()\n    })\n  }\n];',
};
const DB_SAMPLE = "create table accounts (\n  id           text primary key,\n  name         text not null,\n  email        text not null\n);\n\ncreate table invoices (\n  id           text primary key,\n  account_id   text references accounts(id),   -- ownership edge\n  issued_at    date,\n  total_minor  integer,\n  status       text\n);\n\ncreate table invoice_notes (\n  id           text primary key,\n  invoice_id   text references invoices(id),\n  author       text,\n  body         text                             -- free text, from outside\n);";

const JSON_HEADERS = { "content-type": "application/json" };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const DANGER_NOTE = { borderLeftColor: "var(--danger-fg)", color: "var(--danger-fg)" } as const;

export function NewWorld({ providers, packs, drafts, initialDraft, now: initialNow }: NewWorldProps) {
  const router = useRouter();
  const origin = useOrigin();
  const [step, setStep] = useState<0 | 1 | 2>(initialDraft ? 2 : 0);
  const [mode, setMode] = useState<"manual" | "plugin">(initialDraft ? "plugin" : "manual");
  const [adding, setAdding] = useState<Adding | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [draft, setDraft] = useState<DraftForReview | null>(initialDraft);
  const [form, setForm] = useState<{ vendor: string; format: Format; text: string; ddl: string; pack: string }>({ vendor: providers[0]?.id ?? "", format: "mcp", text: "", ddl: "", pack: packs[0]?.id ?? "" });
  const [fields, setFields] = useState<ReviewFields>({ name: initialDraft?.input?.name ?? "", domain: initialDraft?.input?.domain ?? "", principal: "", description: initialDraft?.input?.description ?? "" });
  const [worldId, setWorldId] = useState(slugify(initialDraft?.input?.name ?? ""));
  const [idTouched, setIdTouched] = useState(false);
  const [liveDrafts, setLiveDrafts] = useState<DraftSummary[]>(drafts);
  const [token, setToken] = useState<string | null>(null);
  const [now, setNow] = useState(initialNow);
  const [busy, setBusy] = useState<"generate" | "create" | "open" | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  /** A build token for one plugin run. `register_agent` refuses without a live one. */
  async function newToken() {
    try {
      const res = await fetch("/api/worlds/build-tokens", { method: "POST" });
      if (res.ok) setToken(((await res.json()) as { token: string }).token);
    } catch {
      /* the field stays empty; the copy says where it comes from */
    }
  }

  // The plugin step watches the draft registry: a draft the plugin just made appears within 5 s.
  useEffect(() => {
    if (step !== 1 || mode !== "plugin") return;
    const tick = async () => {
      try {
        const res = await fetch("/api/worlds/drafts", { cache: "no-store" });
        if (res.ok) setLiveDrafts((await res.json()) as DraftSummary[]);
        setNow(Date.now());
      } catch {
        /* keep the last list */
      }
    };
    void tick();
    const t = setInterval(tick, 5000);
    return () => clearInterval(t);
  }, [step, mode]);

  useEffect(() => {
    if (busy !== "generate") return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const copyId = isCopyOnly(sources);
  const copyPack = copyId ? packs.find((p) => p.id === copyId) ?? null : null;
  const entities = draft ? draftEntities(draft.files) : [];
  const tools = draft ? draftTools(draft.files) : [];
  const scenario = draft ? draftScenario(draft.files) : null;

  function setName(name: string) {
    setFields((f) => ({ ...f, name }));
    if (!idTouched) setWorldId(slugify(name));
  }

  /** A first guess at the domain slug from the first source: a provider's kind, or the pasted kind. */
  function guessDomain(): string {
    const first = sources[0];
    if (!first) return "";
    if (first.kind === "mcp") return providers.find((p) => p.id === first.provider)?.kind ?? "custom";
    return first.kind === "db" ? "database" : first.kind === "tools" ? "custom" : "";
  }

  function goReview() {
    if (mode === "manual" && !fields.name.trim() && sources.length > 0) setName(copyPack ? `${copyPack.name} copy` : `${srcLabel(sources[0], providers, packs)} desk`);
    if (copyPack) setFields((f) => ({ ...f, domain: f.domain || copyPack.domain, description: f.description || copyPack.description }));
    else if (!fields.domain.trim()) setFields((f) => ({ ...f, domain: guessDomain() }));
    setStep(2);
  }

  function addSource() {
    const f = form;
    const next: Source | null =
      adding === "mcp" && f.vendor ? { kind: "mcp", provider: f.vendor }
      : adding === "tools" && f.text.trim() ? { kind: "tools", format: f.format, text: f.text }
      : adding === "db" && f.ddl.trim() ? { kind: "db", ddl: f.ddl }
      : adding === "pack" && f.pack ? { kind: "pack", packId: f.pack }
      : null;
    if (!next) return;
    setSources((s) => [...s, next]);
    setForm((prev) => ({ ...prev, text: "", ddl: "" }));
    setAdding(null);
  }

  async function openDraft(id: string) {
    setBusy("open");
    setError(null);
    try {
      const res = await fetch(`/api/worlds/drafts/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!res.ok) {
        setError("That draft has expired — drafts live in memory for two hours. Run the plugin again.");
        return;
      }
      const d = (await res.json()) as { id: string; files: Record<string, string>; errors: ValidationError[]; input: { name: string; domain: string; description: string } };
      setDraft({ id: d.id, files: d.files, errors: d.errors, input: d.input });
      setFields((f) => ({ ...f, name: d.input.name, domain: d.input.domain, description: d.input.description }));
      if (!idTouched) setWorldId(slugify(d.input.name));
      setStep(2);
    } catch {
      setError("Network error — the draft could not be loaded.");
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy("generate");
    setElapsed(0);
    setError(null);
    try {
      const res = await fetch("/api/worlds/generate", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(toGenerateInput(sources, fields, providers)) });
      const data = (await res.json().catch(() => ({}))) as { files?: Record<string, string>; errors?: ValidationError[]; error?: string };
      if (!res.ok || !data.files) {
        setError(data.error ?? `Generation failed (HTTP ${res.status}).`);
        return;
      }
      setDraft({ files: data.files, errors: data.errors ?? [] });
      if (!idTouched) setWorldId(slugify(fields.name));
    } catch {
      setError("Network error — nothing was generated.");
    } finally {
      setBusy(null);
    }
  }

  async function create() {
    if (!isValidWorldId(worldId)) return setError("Give the World an id of 2–41 characters: lowercase letters, digits and hyphens, starting with a letter or digit.");
    setBusy("create");
    setError(null);
    try {
      let files = draft?.files;
      if (!files && copyId) {
        const res = await fetch(`/api/worlds/${copyId}`);
        if (!res.ok) return setError(`Could not read the pack '${copyId}'.`);
        files = ((await res.json()) as { pack: { files: Record<string, string> } }).pack.files;
      }
      if (!files) return setError("Nothing to create yet — generate the World first.");
      const body = { id: worldId, files: { ...files, "pack.yaml": withPackId(files["pack.yaml"] ?? "", worldId) } };
      const res = await fetch("/api/worlds", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) });
      if (res.ok) {
        router.push(`/worlds/${worldId}`);
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: ValidationError[] };
      setError(data.error ?? (data.errors?.length ? `${data.errors.length} validation error${data.errors.length === 1 ? "" : "s"}: ${data.errors.map((e) => `${e.file}${e.path ? ` · ${e.path}` : ""}: ${e.message}`).join(" · ")}` : `The World was not created (HTTP ${res.status}).`));
    } catch {
      setError("Network error — nothing was created.");
    } finally {
      setBusy(null);
    }
  }

  // ---- the primary action per step ----
  const canGenerate = fields.name.trim() !== "" && fields.domain.trim() !== "" && fields.description.trim() !== "";
  const primary =
    step === 0 ? { label: "Continue →", disabled: false, run: () => setStep(1) }
    : step === 1 ? { label: mode === "plugin" ? "Review →" : "Review →", disabled: mode === "manual" ? sources.length === 0 : !draft, run: goReview }
    : draft || copyPack ? { label: busy === "create" ? "Creating…" : "Create World", disabled: busy !== null || !isValidWorldId(worldId), run: create }
    : { label: busy === "generate" ? `Generating… ${elapsed}s` : "Generate with Claude", disabled: busy !== null || !canGenerate, run: generate };

  const stepLabels = ["How", mode === "plugin" ? "Generate" : "Compose", "Review"];
  const canJump = (i: number) => i < step || (i === 2 && (sources.length > 0 || draft !== null));
  const surface = draft
    ? `${plural(tools.length, "tool")} · ${plural(entities.length, "entity", "entities")}`
    : copyPack
      ? `${plural(copyPack.tools, "tool")} · ${plural(copyPack.entities, "entity", "entities")}`
      : `${sources.reduce((n, s) => n + (srcToolCount(s, providers, packs) ?? 0), 0)}+ tools across ${plural(sources.length, "source")} — the rest is generated`;

  return (
    <section id="view-world">
      <Link className="back-link" href="/worlds">← All worlds</Link>
      <div className="crumb">
        World / <b>New world</b>
      </div>
      <h1 className="page serif">New world</h1>
      <p className="sub">
        A World is the union of everything the agent can reach — several third-party MCPs, your own tool definitions, a database. Compose it yourself, or let the worldbuilder plugin read your agent&rsquo;s repo and draft it; either way it ends in the same sandbox with one ownership graph.
      </p>

      <div className="nw-steps">
        {stepLabels.map((label, i) => (
          <Fragment key={label}>
            <button type="button" className={`step-chip${i === step ? " current" : i < step ? " done" : ""}`} disabled={!canJump(i) && i !== step} style={{ cursor: canJump(i) ? "pointer" : "default" }} onClick={() => canJump(i) && setStep(i as 0 | 1 | 2)}>
              <span className="num">{i < step ? "✓" : i + 1}</span>
              {label}
            </button>
            {i < 2 && <div className="step-line" />}
          </Fragment>
        ))}
      </div>

      <div className="panel card-pad" style={{ maxWidth: 940 }}>
        {step === 0 && (
          <>
            <h2>How do you want to build it?</h2>
            <label className={`option${mode === "manual" ? " selected" : ""}`}>
              <input type="radio" name="nwmode" checked={mode === "manual"} onChange={() => setMode("manual")} />
              <div style={{ flex: 1 }}>
                <div className="label">Compose it yourself</div>
                <div className="desc">Add each source by hand — a third-party MCP, your own tool definitions, a database schema, or a copy of an installed pack. You decide what the World contains.</div>
              </div>
            </label>
            <label className={`option${mode === "plugin" ? " selected" : ""}`}>
              <input
                type="radio"
                name="nwmode"
                checked={mode === "plugin"}
                onChange={() => {
                  setMode("plugin");
                  if (token === null) void newToken(); // issued on the way in, so the step never renders an empty field
                }}
              />
              <div style={{ flex: 1 }}>
                <div className="label">
                  Generate it with the worldbuilder plugin <span className="roadmap-tag">plugin</span>
                </div>
                <div className="desc">Install <span className="mono">agentsim-worldbuilder</span>, point it at this AgentSim, and ask it from inside your agent&rsquo;s repo. It reads the tools, schema and OpenAPI it finds there and drafts a World — entities, ownership, seed rows, tools, a first Scenario and an Attack — which you review here.</div>
              </div>
            </label>
          </>
        )}

        {step === 1 && mode === "plugin" && (
          <>
            <h2>Run the worldbuilder plugin</h2>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "-8px 0 16px" }}>
              Install the plugin once, point it at this AgentSim, then ask it from your agent&rsquo;s own repo. It reads your tools, your schema, the third-party MCP servers you integrate and the Mandates your policy docs state, and drafts the World&rsquo;s structure here. It writes no Scenario and no seed row — those are generated on the World afterwards, once you have reviewed what it built.
            </p>
            <span className="field-label">1 · Install</span>
            <div className="copyfield" style={{ marginBottom: 8 }}>
              <code>claude plugin marketplace add ./claude-plugin</code>
              <CopyButton text="claude plugin marketplace add ./claude-plugin" what="Command" />
            </div>
            <div className="copyfield" style={{ marginBottom: 18 }}>
              <code>claude plugin install agentsim-worldbuilder</code>
              <CopyButton text="claude plugin install agentsim-worldbuilder" what="Command" />
            </div>
            <span className="field-label">2 · Point it here</span>
            <div className="copyfield" style={{ marginBottom: 6 }}>
              <code>{origin ? `${origin}/mcp/worlds` : "…/mcp/worlds"}</code>
              <CopyButton text={origin ? `${origin}/mcp/worlds` : ""} what="URL" />
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 18px" }}>
              The plugin&rsquo;s <span className="mono">.mcp.json</span> points at <span className="mono">http://localhost:3000/mcp/worlds</span>; edit it if this AgentSim is elsewhere. Off localhost, the server also needs <span className="mono">AGENTSIM_ALLOWED_HOSTS</span> naming the host it is reached on.
            </p>
            <span className="field-label">3 · Your build token</span>
            <div className="token-line">
              <div className="copyfield" style={{ flex: 1, minWidth: 220 }}>
                <code>{token ?? "issuing…"}</code>
                <CopyButton text={token ?? ""} what="Token" />
              </div>
              <button type="button" className="btn btn-ghost" style={{ height: 38, fontSize: 12 }} onClick={() => void newToken()}>New token</button>
            </div>
            <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 18px" }}>
              Single use, expires in an hour. It is what lets the plugin spend a model call here, so drafting a World needs this console rather than just the URL.
            </p>
            <span className="field-label">4 · In your agent&rsquo;s repo, in a Claude Code session</span>
            <div className="copyfield" style={{ marginBottom: 18 }}>
              <code>{`Use agentsim-worldbuilder to build a test world for this agent. Build token: ${token ?? "…"}`}</code>
              <CopyButton text={token ? `Use agentsim-worldbuilder to build a test world for this agent. Build token: ${token}` : ""} what="Prompt" />
            </div>
            <div className="chips">
              {WB_TOOLS.map((k) => (
                <span key={k} className="chip">{k}</span>
              ))}
            </div>
            <div style={{ marginTop: 26, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
              <span className="field-label">Drafts · one per plugin run · refreshes every 5 s</span>
              {liveDrafts.length === 0 && <div className="empty-src">No drafts yet. When the plugin calls <span className="mono">register_agent</span>, its draft appears here.</div>}
              {liveDrafts.map((d) => (
                <div key={d.id} className={`draft-row${d.token === token ? " mine" : ""}`}>
                  <div style={{ minWidth: 0 }}>
                    <div>
                      <span className="draft-id">{d.id}</span>
                      <span className={`pill-badge ${d.valid ? "badge-warning" : "badge-danger"}`} style={{ marginLeft: 6 }}>{d.valid ? "awaiting review" : plural(d.errorCount, "error")}</span>
                    </div>
                    <div className="draft-meta">
                      {d.repo ?? d.name} · {d.client ?? "unknown client"} · {relativeTime(new Date(d.createdAt).toISOString(), now)} · {plural(d.tools, "tool")}, {plural(d.entities, "entity", "entities")}, {plural(d.mandates, "Mandate")}
                    </div>
                  </div>
                  <div className="draft-actions">
                    <button type="button" className="btn btn-ghost" style={{ height: 30, fontSize: 12 }} disabled={busy !== null} onClick={() => openDraft(d.id)}>Review →</button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {step === 1 && mode === "manual" && (
          <>
            <h2>Sources in this World</h2>
            {sources.length === 0 ? (
              <div className="empty-src">Nothing added yet. Most real Worlds are three or four sources: the SaaS the agent reads from, the team&rsquo;s own service, and wherever the files live.</div>
            ) : (
              <div className="src-list">
                {sources.map((src, i) => {
                  const keys = sources.map((_, j) => `s${j}`);
                  const colour = systemColor(keys, `s${i}`);
                  const n = srcToolCount(src, providers, packs);
                  return (
                    <div key={i} className="src-item">
                      <span className="src-kind" style={{ background: colour.bg, color: colour.fg }}>{SRC_KIND[src.kind]}</span>
                      <div style={{ minWidth: 0 }}>
                        <div className="src-name">
                          {srcLabel(src, providers, packs)} <span className="src-mode">{srcMode(src)}</span>
                        </div>
                        <div className="src-detail">
                          {src.kind === "mcp" ? "Tool surface mirrored from the provider catalog." : src.kind === "tools" ? `${src.text.split("\n").length} lines pasted — tools and the ids they name become entities.` : src.kind === "db" ? "Foreign keys become ownership edges; free-text columns are flagged untrusted." : "Copied as-is under a new id."}
                        </div>
                      </div>
                      <span className="src-count">{n !== null ? plural(n, "tool") : "pasted"}</span>
                      <button type="button" className="src-remove" title="Remove" aria-label={`Remove ${srcLabel(src, providers, packs)}`} onClick={() => setSources((s) => s.filter((_, j) => j !== i))}>✕</button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="add-row">
              {ADD_TYPES.map(([k, label]) => (
                <button key={k} type="button" className={`add-btn${adding === k ? " active" : ""}`} onClick={() => setAdding(adding === k ? null : k)}>{label}</button>
              ))}
              <button type="button" className="add-btn" disabled title="Object storage sources are on the roadmap" style={{ opacity: 0.55, cursor: "not-allowed" }}>
                + Object storage <span className="roadmap-tag" style={{ marginLeft: 6 }}>roadmap</span>
              </button>
            </div>

            {adding && (
              <div style={{ marginTop: 18, borderTop: "1px solid var(--border)", paddingTop: 18 }}>
                {adding === "mcp" && (
                  <>
                    <h2>Shadow a third-party MCP</h2>
                    <div className="vendor-grid">
                      {providers.map((p) => (
                        <button key={p.id} type="button" className={`vendor${form.vendor === p.id ? " selected" : ""}`} aria-pressed={form.vendor === p.id} onClick={() => setForm({ ...form, vendor: p.id })}>
                          <span className="tile" style={{ background: p.hue }}>{p.label.slice(0, 2).toUpperCase()}</span>
                          <span>
                            {p.label}
                            <span className="sub">{p.kind}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="nw-note">
                      <b>Shadow mode.</b> AgentSim mirrors the provider&rsquo;s tool surface from its catalog and the Run talks only to the clone — every write lands in the sandbox, never in a live tenant. That clone is what makes an Attack safe to run at all.
                    </div>
                    <span className="field-label">Tool surface</span>
                    <table className="tooltable">
                      <thead>
                        <tr><th>Tool</th><th>Description</th></tr>
                      </thead>
                      <tbody>
                        {(providers.find((p) => p.id === form.vendor)?.tools ?? []).map((t) => (
                          <tr key={t.name}>
                            <td className="t-name">{t.name}</td>
                            <td style={{ color: "var(--muted)" }}>{t.description}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                {adding === "tools" && (
                  <>
                    <h2>Paste your own tool definitions</h2>
                    <div style={{ marginBottom: 12 }}>
                      <span className="seg">
                        {(Object.keys(FORMAT_LABEL) as Format[]).map((f) => (
                          <button key={f} type="button" className={form.format === f ? "active" : ""} onClick={() => setForm({ ...form, format: f })}>{FORMAT_LABEL[f]}</button>
                        ))}
                      </span>
                    </div>
                    <textarea className="nw-ta" spellCheck={false} value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={PASTE_SAMPLES[form.format]} aria-label="Tool definitions" />
                    <div className="nw-note" style={{ marginTop: 16 }}>
                      <b>What AgentSim does with it.</b> Every tool becomes callable in the World. Arguments that look like ids (<span className="mono">invoice_id</span>, <span className="mono">account_id</span>) become entities and the edges between them; free-text arguments and returned bodies are flagged untrusted, because that is where an Attack can plant text.
                    </div>
                  </>
                )}
                {adding === "db" && (
                  <>
                    <h2>Mock a database</h2>
                    <textarea className="nw-ta" spellCheck={false} value={form.ddl} onChange={(e) => setForm({ ...form, ddl: e.target.value })} placeholder={DB_SAMPLE} aria-label="Database schema" />
                    <div className="nw-note" style={{ marginTop: 14 }}>
                      <b>Foreign keys are the point.</b> Each <span className="mono">references</span> becomes an ownership edge, so <span className="mono">invoice_notes → invoices → accounts</span> resolves to one principal — which is what makes &ldquo;did the agent read someone else&rsquo;s records&rdquo; mechanical. Free-text columns are flagged untrusted for the same reason. Rows are always synthetic: the schema is yours, the data never is.
                    </div>
                  </>
                )}
                {adding === "pack" && (
                  <>
                    <h2>Copy an installed pack</h2>
                    <div className="world-grid">
                      {packs.map((p) => (
                        <button key={p.id} type="button" className={`world-card${form.pack === p.id ? " selected" : ""}`} aria-pressed={form.pack === p.id} style={{ width: "100%" }} onClick={() => setForm({ ...form, pack: p.id })}>
                          <h3>{p.name}</h3>
                          <div className="domain">{p.domain}</div>
                          <p>{p.description}</p>
                          <div className="meta-row">
                            <span>{plural(p.entities, "entity", "entities")}</span>
                            <span>{plural(p.tools, "tool")}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                  <button type="button" className="btn btn-primary" onClick={addSource} disabled={(adding === "tools" && !form.text.trim()) || (adding === "db" && !form.ddl.trim()) || (adding === "mcp" && !form.vendor) || (adding === "pack" && !form.pack)}>Add to World</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAdding(null)}>Cancel</button>
                </div>
              </div>
            )}
          </>
        )}

        {step === 2 && (
          <>
            <h2>Review the World</h2>
            {draft?.id && (
              <div className="draftbar">
                <span className="draft-id">{draft.id}</span>
                <span className={`pill-badge ${draft.errors.length ? "badge-danger" : "badge-warning"}`}>{draft.errors.length ? plural(draft.errors.length, "error") : "awaiting review"}</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>drafted by the worldbuilder plugin · new World</span>
                <span style={{ marginLeft: "auto", fontSize: 11.5, color: "var(--muted)" }}>Yours to create or discard.</span>
              </div>
            )}
            {draft && (
              <div className="nw-note">
                <b>Drafted, not applied.</b> Check the ownership joins before you run anything — a wrong edge silently makes <span className="mono">reads_scoped</span> meaningless.
              </div>
            )}
            <div className="shadowbar">
              <b>Sandboxed.</b> {plural(Math.max(sources.length, draft ? 1 : 0), "source")}, cloned — nothing in this World can reach a live system, which is what makes Attacks safe to run against it.
            </div>

            <div className="step-grid" style={{ marginBottom: 18 }}>
              <div>
                <div className="form-row">
                  <label htmlFor="nwName">Name</label>
                  <input id="nwName" value={fields.name} onChange={(e) => setName(e.target.value)} placeholder="Zendesk desk" />
                </div>
                <div className="form-row">
                  <label htmlFor="nwId">World id</label>
                  <input id="nwId" className="mono" value={worldId} onChange={(e) => { setIdTouched(true); setWorldId(e.target.value); }} placeholder="zendesk-desk" />
                </div>
                <div className="form-row">
                  <label htmlFor="nwDomain">Domain</label>
                  <input id="nwDomain" className="mono" value={fields.domain} onChange={(e) => setFields({ ...fields, domain: e.target.value })} placeholder="support-commerce" />
                </div>
              </div>
              <div>
                <div className="form-row">
                  <label htmlFor="nwPrincipal">Principal — the one identity every row must resolve to</label>
                  <input id="nwPrincipal" value={fields.principal} onChange={(e) => setFields({ ...fields, principal: e.target.value })} placeholder="the account, the member, the employee…" />
                </div>
                <div className="form-row">
                  <label htmlFor="nwDesc">Description — what the agent does in this World</label>
                  <textarea id="nwDesc" value={fields.description} onChange={(e) => setFields({ ...fields, description: e.target.value })} placeholder="A support desk for a small SaaS. The agent reads tickets and invoices and may credit an invoice within a limit." />
                </div>
                <div className="form-row">
                  <label htmlFor="nwSurface">Surface</label>
                  <input id="nwSurface" value={surface} disabled style={{ color: "var(--muted)" }} />
                </div>
              </div>
            </div>

            {draft && draft.errors.length > 0 && (
              <div className="nw-note" style={DANGER_NOTE}>
                <b>The draft does not validate yet — it cannot be created until it does.</b> Fix it with <span className="mono">refine_world</span> from the plugin, or create anyway is not offered.
                {draft.errors.slice(0, 12).map((e, i) => (
                  <div key={i} style={{ marginTop: 4 }}>
                    <span className="mono">{e.file}{e.path ? ` · ${e.path}` : ""}</span>: {e.message}
                  </div>
                ))}
                {draft.errors.length > 12 && <div style={{ marginTop: 4 }}>… and {draft.errors.length - 12} more.</div>}
              </div>
            )}

            {draft ? (
              <>
                <span className="field-label">Entities</span>
                <div className="table-wrap" style={{ marginBottom: 18 }}>
                  <table className="maptable">
                    <thead>
                      <tr><th>Entity</th><th>Id prefix</th><th>Untrusted field</th></tr>
                    </thead>
                    <tbody>
                      {entities.map((e) => (
                        <tr key={e.name}>
                          <td className="mono" style={{ fontSize: 12 }}>{e.name}</td>
                          <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{e.prefix}</td>
                          <td>{e.untrusted ? <span className="untrusted-tag" style={{ margin: 0 }}>⚠ {e.untrusted}</span> : <span style={{ color: "var(--muted)", fontSize: 11.5 }}>none</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <span className="field-label">Tools</span>
                <div className="table-wrap">
                  <table className="tooltable">
                    <thead>
                      <tr><th>Tool</th><th>System</th><th>Description</th></tr>
                    </thead>
                    <tbody>
                      {tools.map((t) => (
                        <tr key={t.name}>
                          <td className="t-name">{t.name}</td>
                          <td style={{ fontSize: 11.5, color: "var(--muted)" }}>{t.system}</td>
                          <td style={{ color: "var(--muted)" }}>{t.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : copyPack ? (
              <div className="nw-note">
                <b>Copies {copyPack.name} as it is.</b> {plural(copyPack.entities, "entity", "entities")}, {plural(copyPack.tools, "tool")}, every Scenario and every Reference Agent prompt, under the new id — edit any of it on the World&rsquo;s tabs afterwards.
              </div>
            ) : (
              <div className="nw-note">
                <b>One graph, not {sources.length}.</b> Generate with Claude to turn these sources into entities, an ownership map, synthetic seed rows, tools and a first Scenario with an Attack — then review the result here before anything is created. Generation takes a minute or two and needs <span className="mono">ANTHROPIC_API_KEY</span> on the server.
              </div>
            )}

            {scenario && (
              <div style={{ marginTop: 26, borderTop: "1px solid var(--border)", paddingTop: 20 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                  <h2 style={{ margin: 0 }}>First Scenario, drafted</h2>
                  <span className="tag-xs">proposal — edit it in the World</span>
                </div>
                <p style={{ fontSize: 12.5, margin: "0 0 10px" }}><b>{scenario.title}</b></p>
                <div className="mandate-quote" style={{ fontSize: 12.5, marginBottom: 14, whiteSpace: "pre-line" }}>{scenario.policy}</div>
                <div className="table-wrap" style={{ marginBottom: 14 }}>
                  <table className="maptable">
                    <thead>
                      <tr><th>Dimension</th><th>Check</th><th>What it binds</th></tr>
                    </thead>
                    <tbody>
                      {scenario.checks.map((c, i) => (
                        <tr key={i}>
                          <td style={{ fontSize: 11.5, whiteSpace: "nowrap" }}>{c.dimension}</td>
                          <td><span className="ctype">{c.type}</span></td>
                          <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{c.params}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {scenario.attack && (
                  <div className="inject-box" style={{ margin: 0 }}>
                    <b>And one Attack to break it — {scenario.attack.id}.</b> {scenario.attack.title}. Lure: <span className="mono">{scenario.attack.lure}</span>. It plants its text in a field the draft flagged untrusted, which is the only reason it has anywhere to land.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="footer-actions" style={{ maxWidth: 940 }}>
        <button type="button" className="btn btn-ghost" style={{ visibility: step === 0 ? "hidden" : "visible" }} onClick={() => setStep((s) => (s > 0 ? ((s - 1) as 0 | 1 | 2) : s))}>← Back</button>
        <div className="right">
          <Link className="btn btn-ghost" href="/worlds">Cancel</Link>
          <button type="button" className="btn btn-primary" disabled={primary.disabled} onClick={primary.run}>{primary.label}</button>
        </div>
      </div>
      {error && (
        <div className="nw-note" style={{ ...DANGER_NOTE, maxWidth: 940, marginTop: 16 }} role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
