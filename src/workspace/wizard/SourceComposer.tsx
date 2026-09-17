"use client";
// "Sources in this World/Agent": what has been added, the ways to add more, and the panel for the
// kind being added — provider tiles with a live tool surface, pasted tools, a schema, a pack.
import { useId, useState } from "react";
import { Button } from "@/marketing/Button";
import { Icon } from "@/marketing/icons";
import { eyebrow, fieldLabel, hint, input, tag } from "../ui";
import { FORMAT_LABEL, SRC_KIND, srcLabel, srcMode, srcToolCount, toolLines, type PackPick, type ProviderInfo, type Source, type ToolFormat } from "./composeModel";

type Adding = "mcp" | "tools" | "db" | "pack";

const ADD_BUTTONS: { kind: Adding | "s3"; label: string; roadmap?: boolean }[] = [
  { kind: "mcp", label: "Third-party MCP" },
  { kind: "tools", label: "Your own tools" },
  { kind: "db", label: "Database" },
  { kind: "pack", label: "Copy a pack" },
  { kind: "s3", label: "Object storage", roadmap: true },
];

export function ProviderTile({ provider, selected, onSelect }: { provider: ProviderInfo; selected: boolean; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`flex w-full cursor-pointer items-start gap-3 rounded-panel border p-4 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? "border-primary/70 bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-control font-label text-[11px] font-semibold uppercase text-white" style={{ background: provider.hue }} aria-hidden>
        {provider.label.slice(0, 2)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-heading text-body font-semibold">{provider.label}</span>
        <span className="mt-0.5 block text-caption text-muted-foreground">{provider.kind} · {provider.tools.length} tools</span>
      </span>
    </button>
  );
}

export function ToolSurface({ tools }: { tools: { name: string; description: string }[] }) {
  return (
    <div className="mt-5">
      <p className={eyebrow}>Tool surface</p>
      <div className="mt-2 overflow-x-auto rounded-control border border-border">
        <table className="w-full text-left text-caption">
          <thead className="font-label text-label-sm uppercase text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-4 py-2 font-medium">Tool</th>
              <th className="px-4 py-2 font-medium">Description</th>
            </tr>
          </thead>
          <tbody>
            {tools.map((t) => (
              <tr key={t.name} className="border-b border-border last:border-b-0">
                <td className="whitespace-nowrap px-4 py-2 align-top font-label text-foreground">{t.name}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function PackTiles({ packs, selected, onSelect }: { packs: PackPick[]; selected: string | null; onSelect: (id: string) => void }) {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="radiogroup" aria-label="Installed worlds">
      {packs.map((p) => (
        <li key={p.id}>
          <button
            type="button"
            role="radio"
            aria-checked={selected === p.id}
            onClick={() => onSelect(p.id)}
            className={`flex h-full w-full cursor-pointer flex-col rounded-panel border p-4 text-left transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected === p.id ? "border-primary/70 bg-primary/10" : "border-border bg-background hover:border-primary/40"}`}
          >
            <span className="flex items-center justify-between gap-2">
              <span className="font-heading text-body font-semibold">{p.name}</span>
              <span className={tag}>{p.domain}</span>
            </span>
            <span className="mt-2 line-clamp-2 text-caption text-muted-foreground">{p.description}</span>
            <span className="mt-3 font-label text-[11px] uppercase text-muted-foreground">{p.entities} entities · {p.tools} tools</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function SourceComposer({ subject, sources, onChange, providers, packs, allowPack }: { subject: "World" | "Agent"; sources: Source[]; onChange: (s: Source[]) => void; providers: ProviderInfo[]; packs: PackPick[]; allowPack: boolean }) {
  const id = useId();
  const [adding, setAdding] = useState<Adding | null>("mcp");
  const [provider, setProvider] = useState<string | null>(providers[0]?.id ?? null);
  const [format, setFormat] = useState<ToolFormat>("mcp");
  const [text, setText] = useState("");
  const [ddl, setDdl] = useState("");
  const [packId, setPackId] = useState<string | null>(null);

  const chosen = providers.find((p) => p.id === provider) ?? null;
  const alreadyShadowed = (pid: string) => sources.some((s) => s.kind === "mcp" && s.provider === pid);

  const add = (s: Source) => onChange([...sources, s]);
  const remove = (i: number) => onChange(sources.filter((_, j) => j !== i));

  return (
    <div>
      <h2 className="font-heading text-h3 font-semibold">Sources in this {subject}</h2>

      {sources.length === 0 ? (
        <p className="mt-4 rounded-panel border border-dashed border-border bg-background/60 px-5 py-4 text-body text-muted-foreground">
          Nothing added yet. Most real {subject}s are three or four sources: the SaaS the agent reads from, the team&apos;s own service, and wherever the files live.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {sources.map((s, i) => {
            const count = srcToolCount(s, providers, packs) ?? (s.kind === "tools" ? toolLines(s.text, s.format).length : null);
            return (
              <li key={`${s.kind}-${i}`} className="animate-line-in flex flex-wrap items-center gap-3 rounded-panel border border-border bg-background px-4 py-3">
                <span className={tag}>{SRC_KIND[s.kind]}</span>
                <span className="font-heading text-body font-semibold">{srcLabel(s, providers, packs)}</span>
                <span className="text-caption text-muted-foreground">{srcMode(s)}{count !== null ? ` · ${count} tools` : ""}</span>
                <button type="button" onClick={() => remove(i)} className="ml-auto cursor-pointer text-caption text-muted-foreground underline-offset-4 hover:text-danger hover:underline focus-visible:outline-2 focus-visible:outline-ring">Remove</button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {ADD_BUTTONS.filter((b) => allowPack || b.kind !== "pack").map((b) => {
          const active = adding === b.kind;
          return (
            <button
              key={b.kind}
              type="button"
              disabled={b.roadmap}
              aria-pressed={active}
              onClick={() => setAdding(b.kind as Adding)}
              className={`inline-flex min-h-11 items-center gap-2 rounded-control border px-4 text-body font-medium transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                b.roadmap ? "cursor-not-allowed border-dashed border-border text-muted-foreground/60" : active ? "border-primary bg-primary text-primary-foreground" : "cursor-pointer border-dashed border-border text-foreground hover:border-primary/60"
              }`}
              title={b.roadmap ? "Object storage sources are on the roadmap" : undefined}
            >
              + {b.label}
              {b.roadmap && <span className="rounded-full border border-border px-2 py-0.5 font-label text-[10px] uppercase">roadmap</span>}
            </button>
          );
        })}
      </div>

      <div className="mt-6 border-t border-border pt-6">
        {adding === "mcp" && (
          <div>
            <h3 className="font-heading text-h3 font-semibold">Shadow a third-party MCP</h3>
            <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {providers.map((p) => (
                <li key={p.id}><ProviderTile provider={p} selected={provider === p.id} onSelect={() => setProvider(p.id)} /></li>
              ))}
            </ul>
            <div className="mt-5 rounded-panel border border-border border-l-2 border-l-primary bg-background px-5 py-4 text-body text-muted-foreground">
              <b className="text-foreground">Shadow mode.</b> AgentSim mirrors the provider&apos;s tool surface from its catalog and the Run talks only to the clone — every write lands in the sandbox, never in a live tenant. That clone is what makes an Attack safe to run at all.
            </div>
            {chosen && (
              <>
                <ToolSurface tools={chosen.tools} />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-caption text-muted-foreground">{alreadyShadowed(chosen.id) ? `${chosen.label} is already in this ${subject}.` : `${chosen.tools.length} tools will be mirrored.`}</p>
                  <Button variant="outline" disabled={alreadyShadowed(chosen.id)} onClick={() => add({ kind: "mcp", provider: chosen.id })}>
                    <Icon name="plus" className="size-4" /> Add {chosen.label}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}

        {adding === "tools" && (
          <div>
            <h3 className="font-heading text-h3 font-semibold">Your own tools</h3>
            <p className={hint}>Paste an MCP tools/list payload, an OpenAPI document, or TypeScript exports. One tool name per line also works.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-[200px_1fr]">
              <div>
                <label htmlFor={`${id}-format`} className={fieldLabel}>Format</label>
                <select id={`${id}-format`} value={format} onChange={(e) => setFormat(e.target.value as ToolFormat)} className={`${input} mt-1.5`}>
                  {(Object.keys(FORMAT_LABEL) as ToolFormat[]).map((f) => <option key={f} value={f}>{FORMAT_LABEL[f]}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor={`${id}-tools`} className={fieldLabel}>Definition</label>
                <textarea id={`${id}-tools`} value={text} onChange={(e) => setText(e.target.value)} rows={6} className={`${input} mt-1.5 resize-y font-label text-caption`} placeholder={'{"tools":[{"name":"orders.read"},{"name":"refunds.create"}]}'} />
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-caption text-muted-foreground">{toolLines(text, format).length} tools recognised.</p>
              <Button variant="outline" disabled={toolLines(text, format).length === 0} onClick={() => { add({ kind: "tools", format, text }); setText(""); }}>
                <Icon name="plus" className="size-4" /> Add tools
              </Button>
            </div>
          </div>
        )}

        {adding === "db" && (
          <div>
            <h3 className="font-heading text-h3 font-semibold">Database</h3>
            <p className={hint}>Paste the schema (DDL). Each table becomes a seeded collection with an owner; nothing connects to a live database.</p>
            <label htmlFor={`${id}-ddl`} className={`${fieldLabel} mt-4`}>Schema</label>
            <textarea id={`${id}-ddl`} value={ddl} onChange={(e) => setDdl(e.target.value)} rows={6} className={`${input} mt-1.5 resize-y font-label text-caption`} placeholder={"CREATE TABLE vendors (id text primary key, name text, bank_account text);\nCREATE TABLE invoices (id text primary key, vendor_id text, amount int);"} />
            <div className="mt-4 flex justify-end">
              <Button variant="outline" disabled={!ddl.trim()} onClick={() => { add({ kind: "db", ddl }); setDdl(""); }}>
                <Icon name="plus" className="size-4" /> Add schema
              </Button>
            </div>
          </div>
        )}

        {adding === "pack" && allowPack && (
          <div>
            <h3 className="font-heading text-h3 font-semibold">Copy an installed pack</h3>
            <p className={hint}>Its entities, seed rows, tools and scenarios come along as a starting point.</p>
            <div className="mt-4"><PackTiles packs={packs} selected={packId} onSelect={setPackId} /></div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" disabled={!packId || sources.some((s) => s.kind === "pack" && s.packId === packId)} onClick={() => packId && add({ kind: "pack", packId })}>
                <Icon name="plus" className="size-4" /> Add pack
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
