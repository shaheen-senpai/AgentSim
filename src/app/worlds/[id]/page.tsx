// `/worlds/[id]` — one World pack, on the mock's five tabs (design/agentsim-console.html
// `renderWorldDetail` 1397-1460). A Server Component: it loads the pack and renders the chosen tab;
// the tabs that need interaction are client islands fed plain props. The raw YAML editor lives at
// `/worlds/[id]/edit`.
import Link from "next/link";
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE, type WorldPack } from "@/engine/pack";
import { entityViews } from "@/lib/entityViews";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { EntitiesTab } from "@/ui/worlds/EntitiesTab";
import { OverviewTab } from "@/ui/worlds/OverviewTab";
import { erdLayout } from "@/ui/worlds/ownership";
import { WorldTabs } from "@/ui/worlds/WorldTabs";
import { parseTab, type WorldTab } from "@/ui/worlds/packView";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string | string[]; scenario?: string | string[] }>;

function Body({ pack, tab }: { pack: WorldPack; tab: WorldTab }) {
  switch (tab) {
    case "overview":
      return <OverviewTab meta={pack.meta} tools={pack.tools} />;
    case "entities": {
      const v = entityViews(pack);
      const principalLabel = pack.meta.entities[pack.meta.principal]?.label ?? pack.meta.principal;
      return <EntitiesTab entities={v.entities} modes={v.modes} attackId={v.attackId} principalLabel={principalLabel} layout={erdLayout(pack.meta.entities)} />;
    }
    default:
      return <p className="hint" style={{ margin: 0 }}>This tab is being rebuilt.</p>;
  }
}

function Frame({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <ConsoleShell>
      <section id="view-world">
        <Link className="back-link" href="/worlds">← All worlds</Link>
        <div className="crumb">
          World / <b>{name}</b>
        </div>
        <h1 className="page serif">{name}</h1>
        {children}
        <p style={{ margin: "18px 0 0", fontSize: 12 }}>
          <Link href={`/worlds/${id}/edit`} className="linkish" style={{ fontFamily: "var(--sans)", fontWeight: 500 }}>Edit pack files</Link>
          <span style={{ color: "var(--muted)" }}> — the raw YAML, with validation.</span>
        </p>
      </section>
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
    return (
      <Frame id={id} name={id}>
        <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)" }}>
          <b>This World pack failed to load.</b>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: 11.5 }}>{e instanceof Error ? e.message : String(e)}</pre>
        </div>
      </Frame>
    );
  }

  return (
    <Frame id={id} name={pack.meta.name}>
      <p className="sub">{pack.meta.description}</p>
      <WorldTabs packId={id} current={tab} />
      <div className="panel card-pad" style={{ maxWidth: tab === "overview" ? 760 : 1040 }}>
        <Body pack={pack} tab={tab} />
      </div>
    </Frame>
  );
}
