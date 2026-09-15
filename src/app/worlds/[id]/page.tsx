// `/worlds/[id]` — one World pack, read-only, with tabs driven by `?tab=` (spec §6.2). Task 17
// adds editing on top of these same tabs; Task 18 adds `/worlds/new`.
//
// A server component throughout: it loads the pack with `loadPack` and hands plain data to the
// tab components, none of which are client components — the tab strip is links, so the page needs
// no client JS at all.
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE, type WorldPack } from "@/engine/pack";
import { Header } from "@/ui/Header";
import { heading, mono } from "@/ui/styles";
import { AgentPrompts } from "@/ui/worlds/AgentPrompts";
import { EntityMap } from "@/ui/worlds/EntityMap";
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

        <PackTabs packId={pack.meta.id} current={tab} />
        <div className="pt-1">
          <Body pack={pack} tab={tab} />
        </div>
      </main>
    </div>
  );
}
