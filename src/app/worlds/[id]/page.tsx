// `/worlds/[id]` — one World pack, with tabs driven by `?tab=` (spec §6.2). The page itself stays a
// Server Component throughout: it loads the pack with `loadPack` and renders each tab's read-only
// view exactly as Task 16 left it (`Body` below). Task 17 layers editing on top via `PackEditor`, a
// client island that receives the current tab's read-only render as `children` — it takes over the
// tab strip and the tab body to add Edit/Validate/Save, but never re-implements what `Body` renders.
import { notFound } from "next/navigation";
import { applyAttack } from "@/engine/attack";
import { listPackIds, loadPack, PACK_ID_RE, type WorldPack } from "@/engine/pack";
import { seedWorld } from "@/engine/world";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { heading, mono } from "@/ui/styles";
import { AgentPrompts } from "@/ui/worlds/AgentPrompts";
import { EntityBrowser, type SeedMode } from "@/ui/worlds/EntityBrowser";
import { EntityMap } from "@/ui/worlds/EntityMap";
import { PackEditor } from "@/ui/worlds/PackEditor";
import { PackTabs } from "@/ui/worlds/PackTabs";
import { ScenarioCards } from "@/ui/worlds/ScenarioCards";
import { ToolCards } from "@/ui/worlds/ToolCards";
import { attackOptions, countsLabel, parseTab, type WorldTab } from "@/ui/worlds/packView";
import { toPackSummary } from "@/lib/summaries";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string | string[] }>;

/**
 * Every seed-data view the Entities tab can show: "as seeded" first, then one entry per distinct
 * Attack in the pack. `seedWorld`/`applyAttack` are the engine's real functions — this is the
 * server-side computation `EntityBrowser.tsx` itself is deliberately forbidden from doing (see the
 * "import purity" comment at the top of that file).
 *
 * `seedWorld`/`applyAttack` throw on a malformed pack (a bad `insert_row` target, for instance —
 * pack validation does not fully cover `insert_row`'s row-field types before it reaches
 * `applyAttack`). A generated-but-not-yet-fixed pack can pass `parsePackFiles` and still throw
 * here, so one Attack option is wrapped per-iteration and simply skipped on failure rather than
 * letting it take down the whole Entities tab — `SeedMode` has no error field to surface it with.
 */
function seedModes(pack: WorldPack): SeedMode[] {
  const modes: SeedMode[] = [{ key: "seeded", label: "as seeded", rowsByEntity: pack.seed.rows }];
  for (const opt of attackOptions(pack.scenarios)) {
    try {
      const world = seedWorld(pack);
      applyAttack(pack, world, opt.attack);
      modes.push({ key: opt.key, label: opt.label, rowsByEntity: world.collections });
    } catch {
      // Skip this Attack option — the "as seeded" mode (and any other Attack option) still renders.
    }
  }
  return modes;
}

function Body({ pack, tab }: { pack: WorldPack; tab: WorldTab }) {
  const rowCounts = Object.fromEntries(Object.entries(pack.seed.rows).map(([c, rows]) => [c, rows.length]));
  switch (tab) {
    case "entities":
      return <EntityBrowser meta={pack.meta} modes={seedModes(pack)} />;
    case "tools":
      return <ToolCards meta={pack.meta} tools={pack.tools} />;
    case "scenarios":
      return <ScenarioCards packId={pack.meta.id} scenarios={pack.scenarios} />;
    case "agents":
      return <AgentPrompts agents={pack.agents} />;
    case "overview":
      return <EntityMap meta={pack.meta} rowCounts={rowCounts} tools={pack.tools} now={pack.seed.now} currency={pack.seed.currency} />;
  }
}

/** A pack that does not parse renders its validation errors instead of taking the route down. */
function LoadError({ id, message, tab }: { id: string; message: string; tab: WorldTab }) {
  return (
    <ConsoleShell>
      <main className="p-4 flex flex-col gap-3 max-w-[1200px]">
        <h1 className="text-[17px] font-extrabold tracking-tight">{id}</h1>
        <PackTabs packId={id} current={tab} />
        <section className="border border-[#B23A22] bg-[#FBEAE7] rounded p-3 flex flex-col gap-1">
          <h2 className={heading}>This World pack failed to load</h2>
          <pre className={`${mono} text-[12px] whitespace-pre-wrap`}>{message}</pre>
        </section>
      </main>
    </ConsoleShell>
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
    <ConsoleShell>
      <main className="p-4 flex flex-col gap-3 max-w-[1200px]">
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-[17px] font-extrabold tracking-tight">{pack.meta.name}</h1>
          <span className="text-[11px] border border-[#E3E0D5] rounded-full px-2 py-0.5 text-[#6E6B60]">{pack.meta.domain}</span>
          <span className={`${mono} text-[11px] text-[#6E6B60]`}>{pack.meta.id}</span>
          <div className="flex-1" />
          <span className="text-[11px] text-[#6E6B60]">{countsLabel(toPackSummary(pack))}</span>
        </div>
        <p className="text-[12px] text-[#6E6B60] max-w-[70ch]">{pack.meta.description}</p>

        <PackEditor worldId={pack.meta.id} principal={pack.meta.principal} initialTab={tab} files={pack.files}>
          <Body pack={pack} tab={tab} />
        </PackEditor>
      </main>
    </ConsoleShell>
  );
}
