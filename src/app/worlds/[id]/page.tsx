// `/worlds/[id]` — one World pack, with tabs driven by `?tab=` (spec §6.2). The page itself stays a
// Server Component throughout: it loads the pack with `loadPack` and renders each tab's read-only
// view exactly as Task 16 left it (`Body` below). Task 17 layers editing on top via `PackEditor`, a
// client island that receives the current tab's read-only render as `children` — it takes over the
// tab strip and the tab body to add Edit/Validate/Save, but never re-implements what `Body` renders.
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE, type WorldPack } from "@/engine/pack";
import { Header } from "@/ui/Header";
import { heading, mono } from "@/ui/styles";
import { AgentPrompts } from "@/ui/worlds/AgentPrompts";
import { EntityMap } from "@/ui/worlds/EntityMap";
import { PackEditor } from "@/ui/worlds/PackEditor";
import { PackTabs } from "@/ui/worlds/PackTabs";
import { ScenarioCards } from "@/ui/worlds/ScenarioCards";
import { SeedTables } from "@/ui/worlds/SeedTables";
import { ToolCards } from "@/ui/worlds/ToolCards";
import { countsLabel, parseTab, type WorldTab } from "@/ui/worlds/packView";
import { toPackSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string | string[] }>;

function Body({ pack, tab }: { pack: WorldPack; tab: WorldTab }) {
  const rowCounts = Object.fromEntries(Object.entries(pack.seed.rows).map(([c, rows]) => [c, rows.length]));
  switch (tab) {
    case "seed":
      return <SeedTables meta={pack.meta} seed={pack.seed} />;
    case "tools":
      return <ToolCards meta={pack.meta} tools={pack.tools} />;
    case "scenarios":
      return <ScenarioCards packId={pack.meta.id} scenarios={pack.scenarios} />;
    case "agents":
      return <AgentPrompts agents={pack.agents} />;
    case "overview":
      return <EntityMap meta={pack.meta} rowCounts={rowCounts} tools={pack.tools} />;
  }
}

/** A pack that does not parse renders its validation errors instead of taking the route down. */
function LoadError({ id, message, tab }: { id: string; message: string; tab: WorldTab }) {
  return (
    <div className="min-h-screen text-sm">
      <Header run={null} />
      <main className="p-4 flex flex-col gap-3 max-w-[1200px]">
        <h1 className="text-[17px] font-extrabold tracking-tight">{id}</h1>
        <PackTabs packId={id} current={tab} />
        <section className="border border-[#c8321e] bg-[#fbeeea] rounded p-3 flex flex-col gap-1">
          <h2 className={heading}>This World pack failed to load</h2>
          <pre className={`${mono} text-[12px] whitespace-pre-wrap`}>{message}</pre>
        </section>
      </main>
    </div>
  );
}

export default async function WorldPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const tab = parseTab((await searchParams).tab);

  // The id reaches the filesystem via `path.join` inside `loadPack`, so it is checked first.
  if (!PACK_ID_RE.test(id) || !listPackIds().includes(id)) notFound();

  let pack: WorldPack;
  try {
    pack = loadPack(id);
  } catch (e) {
    return <LoadError id={id} message={e instanceof Error ? e.message : String(e)} tab={tab} />;
  }

  return (
    <div className="min-h-screen text-sm">
      <Header run={null} />
      <main className="p-4 flex flex-col gap-3 max-w-[1200px]">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-[17px] font-extrabold tracking-tight">{pack.meta.name}</h1>
          <span className="text-[11px] border border-[#cfcfcb] rounded-full px-2 py-0.5 text-[#6b6b66]">{pack.meta.domain}</span>
          <span className={`${mono} text-[11px] text-[#6b6b66]`}>{pack.meta.id}</span>
          <div className="flex-1" />
          <span className="text-[11px] text-[#6b6b66]">{countsLabel(toPackSummary(pack))}</span>
        </div>
        <p className="text-[12px] text-[#6b6b66] max-w-[70ch]">{pack.meta.description}</p>

        <PackEditor worldId={pack.meta.id} principal={pack.meta.principal} initialTab={tab} files={pack.files}>
          <Body pack={pack} tab={tab} />
        </PackEditor>
      </main>
    </div>
  );
}
