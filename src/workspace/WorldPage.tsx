// `/agents/[id]/worlds/[worldId]` — one World, on the same five tabs as the console's World page,
// in the workspace theme. Server-rendered: tabs are links (`?tab=`). The parts that edit a pack —
// the draft bar, the Mandate text, generating Scenarios — are client islands fed the pack's files.
import Link from "next/link";
import { Icon } from "@/marketing/icons";
import { systemColor } from "@/ui/systemColor";
import { tabLabel, WORLD_TABS, type WorldTab } from "@/ui/worlds/packView";
import { Clamp } from "./Clamp";
import { card, container, eyebrow, tag } from "./ui";
import { DraftBar } from "./world/DraftBar";
import { MandateList } from "./world/MandateList";
import { ScenarioEditor } from "./world/ScenarioEditor";
import { ScenariosPanel } from "./world/ScenariosPanel";
import type { WorldDetailView } from "./worldDetail";

const KIND_LABEL: Record<WorldDetailView["systems"][number]["kind"], string> = { mcp: "MCP", tools: "Own tools", db: "Database", s3: "Object store" };

function sourceDetail(s: WorldDetailView["systems"][number]): string {
  if (s.mode === "shadowed" && s.provider) return `${s.provider} catalog, mirrored over MCP`;
  if (s.mode === "copied") return "copied from an installed pack";
  if (s.kind === "db") return "schema pasted, rows seeded and mocked";
  return "declared by the agent, pasted";
}

function Overview({ view }: { view: WorldDetailView }) {
  const keys = view.systems.map((s) => s.key);
  return (
    <>
      <h2 className="font-heading text-h3 font-semibold">What this World is made of</h2>
      <p className="mt-2 max-w-3xl text-body text-muted-foreground">
        A World is the union of everything the agent can reach — third-party MCPs, the team&apos;s own tools, a database, a bucket. Each source contributes its own Systems, tools and entities into one ownership graph.
      </p>
      <ul className="mt-5 flex flex-col gap-2">
        {view.systems.map((s, i) => (
          <li key={s.key} className="animate-reveal flex flex-wrap items-center gap-4 rounded-panel border border-border bg-background px-4 py-3" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`${tag} gap-2`}><span className="size-1.5 rounded-full" style={{ background: systemColor(keys, s.key).fg }} aria-hidden />{KIND_LABEL[s.kind]}</span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-2">
                <span className="font-heading text-body font-semibold">{s.label}</span>
                <span className="font-label text-label-sm uppercase text-muted-foreground">{s.mode}</span>
              </span>
              <span className="mt-0.5 block text-caption text-muted-foreground">{sourceDetail(s)}</span>
            </span>
            <span className="font-label text-caption text-muted-foreground">{s.tools} tool{s.tools === 1 ? "" : "s"}</span>
          </li>
        ))}
        {view.systems.length === 0 && <li className="text-caption text-muted-foreground">No sources recorded for this World.</li>}
      </ul>

      <h2 className="mt-8 font-heading text-h3 font-semibold">Systems</h2>
      <ul className="mt-3 flex flex-wrap gap-2">
        {view.systems.map((s) => (
          <li key={s.key} className={`${tag} gap-2 text-foreground`}><span className="size-1.5 rounded-full" style={{ background: systemColor(keys, s.key).fg }} aria-hidden />{s.label} · {s.tools}</li>
        ))}
      </ul>

      <h2 className="mt-8 font-heading text-h3 font-semibold">Principal</h2>
      <p className="mt-2 max-w-3xl text-body text-muted-foreground">
        Every row in this World resolves to one <b className="text-foreground">{view.principal}</b> — that ownership chain is what makes “did the agent read someone else&apos;s records” a mechanical Check.
      </p>
    </>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-control border border-border">
      <table className="w-full text-left text-caption">
        <thead className="font-label text-label-sm uppercase text-muted-foreground">
          <tr className="border-b border-border">{head.map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border last:border-b-0">{r.map((c, j) => <td key={j} className={`px-4 py-2 align-top ${j === 0 ? "whitespace-nowrap font-label text-foreground" : "text-muted-foreground"}`}>{c}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Body({ view, tab, base, scenario }: { view: WorldDetailView; tab: WorldTab; base: string; scenario: string | null }) {
  switch (tab) {
    case "overview":
      return <Overview view={view} />;
    case "entities":
      return (
        <>
          <h2 className="font-heading text-h3 font-semibold">Entities · {view.entities.length}</h2>
          <p className="mt-2 text-body text-muted-foreground">Every collection names its owner; the principal, <b className="text-foreground">{view.principal}</b>, owns itself.</p>
          {view.entities.length ? (
            <Table head={["Collection", "Label", "Fields", "Owner"]} rows={view.entities.map((e) => [e.name, e.label, e.fields ?? "—", e.owner ?? (e.label === view.principal ? "self" : "—")])} />
          ) : (
            <p className="mt-4 text-caption text-muted-foreground">No entities recorded yet.</p>
          )}
        </>
      );
    case "tools": {
      const keys = view.systems.map((s) => s.key);
      return (
        <>
          <h2 className="font-heading text-h3 font-semibold">Tools · {view.tools.length}</h2>
          <p className="mt-2 text-body text-muted-foreground">Reads and writes the agent can make inside this World, grouped by the System that provides them.</p>
          <Table
            head={["Tool", "System", "Kind", "Description"]}
            rows={view.tools.map((t) => [
              t.name,
              <span key="s" className="inline-flex items-center gap-2"><span className="size-1.5 rounded-full" style={{ background: systemColor(keys, t.system).fg }} aria-hidden />{view.systems.find((s) => s.key === t.system)?.label ?? t.system}</span>,
              <span key="k" className={t.kind === "write" ? "text-warning" : ""}>{t.kind}</span>,
              t.description,
            ])}
          />
        </>
      );
    }
    case "mandate":
      return (
        <>
          <h2 className="font-heading text-h3 font-semibold">Mandate{view.mandates.length > 1 ? "s" : ""} · {view.mandates.length}</h2>
          <p className="mt-2 text-body text-muted-foreground">
            The authority boundary a Run is graded against. Violations name the check, the tool call and the record.
            {view.files && " A Scenario cites a Mandate instead of copying it, so editing one here moves every Scenario that cites it."}
          </p>
          {view.mandates.length === 0 ? (
            <p className="mt-4 text-caption text-muted-foreground">
              {view.kind === "pack"
                ? "No Mandates captured yet — the worldbuilder plugin reads them from the agent's own system prompt and policy docs, and a Scenario can always carry its own inline text instead."
                : "No mandate recorded. Add one to the agent so violations have something to be graded against."}
            </p>
          ) : view.files ? (
            <MandateList worldId={view.id} files={view.files} mandates={view.mandates} />
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {view.mandates.map((m) => (
                <li key={m.id} className="rounded-panel border border-border border-l-2 border-l-primary bg-background px-5 py-4">
                  <p className={eyebrow}>{m.label}</p>
                  <p className="mt-2 font-label text-body leading-relaxed">“{m.text}”</p>
                </li>
              ))}
            </ul>
          )}
        </>
      );
    case "scenarios": {
      const open = scenario && view.files ? view.scenarios.find((sc) => sc.id === scenario) : undefined;
      if (open && view.files) return <ScenarioEditor worldId={view.id} files={view.files} scenario={open} backHref={`${base}?tab=scenarios`} />;
      return (
        <>
          <h2 className="font-heading text-h3 font-semibold">Scenarios · {view.scenarios.length}</h2>
          <p className="mt-2 text-body text-muted-foreground">Each shift runs clean, then again with one poisoned record. An attacked Scenario carries the lure.</p>
          {view.files ? (
            <ScenariosPanel worldId={view.id} files={view.files} scenarios={view.scenarios} principal={view.principal} base={base} />
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {view.scenarios.map((s, i) => (
                <li key={s.id} className="animate-reveal rounded-panel border border-border bg-background p-4" style={{ animationDelay: `${i * 50}ms` }}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-label text-label-sm uppercase text-muted-foreground">{s.id}</span>
                    <span className={`font-label text-label-sm uppercase ${s.attacked ? "text-danger" : "text-safe"}`}>{s.attacked ? "Attacked" : "Clean"}</span>
                  </div>
                  <h3 className="mt-2 font-heading text-body font-semibold">{s.title}</h3>
                  {s.policy && <p className="mt-1 line-clamp-2 text-caption text-muted-foreground">{s.policy}</p>}
                </li>
              ))}
              {view.scenarios.length === 0 && <li className="text-caption text-muted-foreground">No Scenarios yet.</li>}
            </ul>
          )}
        </>
      );
    }
  }
}

export function WorldPage({ view, agent, tab, scenario = null }: { view: WorldDetailView; agent: { id: string; name: string }; tab: WorldTab; scenario?: string | null }) {
  const base = `/agents/${agent.id}/worlds/${view.id}`;
  return (
    <main id="main" className={`${container} pb-20 pt-8`}>
      <Link href={`/agents/${agent.id}`} className={`${eyebrow} inline-flex items-center gap-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring`}>
        <Icon name="arrow-left" className="size-3.5" /> {agent.name}
      </Link>
      <nav aria-label="Breadcrumb" className="mt-4 flex flex-wrap items-center gap-2 text-body text-muted-foreground">
        <Link href="/agents" className="hover:text-foreground">Agents</Link><span aria-hidden>/</span>
        <Link href={`/agents/${agent.id}`} className="hover:text-foreground">{agent.name}</Link><span aria-hidden>/</span>
        <span className="font-medium text-foreground">{view.name}</span>
      </nav>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-display font-semibold">{view.name}</h1>
        <span className={tag}>{view.kind === "pack" ? (view.status === "draft" ? "Draft pack" : "Installed pack") : "Drafted"} · {view.domain}</span>
      </div>
      <Clamp text={view.description} lines={4} className="mt-3 max-w-3xl text-lead text-muted-foreground" />
      {view.status === "draft" && view.files && <DraftBar worldId={view.id} agentId={agent.id} files={view.files} scenarioCount={view.scenarios.length} />}

      <div className="mt-7 flex gap-1 overflow-x-auto border-b border-border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="World">
        {WORLD_TABS.map((t) => (
          <Link
            key={t}
            role="tab"
            aria-selected={t === tab}
            href={t === "overview" ? base : `${base}?tab=${t}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-body transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-ring ${t === tab ? "border-primary font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tabLabel(t)}
          </Link>
        ))}
      </div>

      <section className={`${card} animate-fade-in mt-6 p-6 sm:p-8`} key={`${tab}:${scenario ?? ""}`}>
        <Body view={view} tab={tab} base={base} scenario={scenario} />
      </section>

      <p className="mt-5 text-caption text-muted-foreground">
        {view.consoleHref ? (
          <><Link href={`${view.consoleHref}/edit`} className="text-primary underline-offset-4 hover:underline">Edit pack files</Link> — the raw YAML, with validation.</>
        ) : (
          <>Drafted World · promote it to a pack to edit its YAML and run shifts against it.</>
        )}
      </p>
    </main>
  );
}
