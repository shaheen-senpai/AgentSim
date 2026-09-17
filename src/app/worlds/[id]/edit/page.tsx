// `/worlds/[id]/edit` — the raw YAML editor for one World pack, kept whole from the earlier
// console: every file, live validation, Save. Reached from the World detail's "Edit pack files"
// link. The read-only view of a tab is the file text itself; editing swaps in the YAML editor.
import Link from "next/link";
import { notFound } from "next/navigation";
import { listPackIds, loadPack, PACK_ID_RE, type WorldPack } from "@/engine/pack";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { PackEditor } from "@/ui/worlds/PackEditor";
import { tabFileKey } from "@/ui/worlds/editorLogic";
import { parseEditorTab, type EditorTab } from "@/ui/worlds/packView";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type Search = Promise<{ tab?: string | string[] }>;

/** The files a tab covers, shown read-only until "Edit YAML" is pressed. */
function FileView({ files, tab }: { files: Record<string, string>; tab: EditorTab }) {
  const single = tabFileKey(tab);
  const keys = single ? [single] : Object.keys(files).filter((k) => k.startsWith(tab === "scenarios" ? "scenarios/" : "agents/")).sort();
  if (keys.length === 0) return <p className="hint" style={{ margin: 0 }}>No {tab} files in this pack yet.</p>;
  return (
    <>
      {keys.map((k) => (
        <div key={k}>
          <span className="field-label">{k}</span>
          <pre className="mono schema-pre" style={{ whiteSpace: "pre-wrap" }}>{files[k]}</pre>
        </div>
      ))}
    </>
  );
}

function Frame({ id, name, children }: { id: string; name: string; children: React.ReactNode }) {
  return (
    <ConsoleShell>
      <section id="view-world">
        <Link className="back-link" href={`/worlds/${id}`}>← {name}</Link>
        <div className="crumb">
          World / {name} / <b>Edit pack files</b>
        </div>
        <h1 className="page serif">Edit pack files</h1>
        <p className="sub">
          The pack&rsquo;s own YAML — <span className="mono">pack.yaml</span>, <span className="mono">seed.yaml</span>, <span className="mono">tools.yaml</span>, every Scenario and every Reference Agent prompt. Validate before you Save; nothing invalid is written.
        </p>
        {children}
      </section>
    </ConsoleShell>
  );
}

export default async function EditWorldPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const { id } = await params;
  const tab = parseEditorTab((await searchParams).tab);
  if (!PACK_ID_RE.test(id) || !listPackIds().includes(id)) notFound();

  let pack: WorldPack | null = null;
  let loadError: string | null = null;
  try {
    pack = loadPack(id);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  if (!pack) {
    return (
      <Frame id={id} name={id}>
        <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)" }}>
          <b>This World pack failed to load, so it cannot be edited here yet.</b>
          <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: "8px 0 0", fontSize: 11.5 }}>{loadError}</pre>
          <p style={{ margin: "8px 0 0", fontSize: 12 }}>Fix the file on disk under <span className="mono">worldpacks/{id}/</span>, then reload.</p>
        </div>
      </Frame>
    );
  }

  return (
    <Frame id={id} name={pack.meta.name}>
      <PackEditor worldId={id} principal={pack.meta.principal} initialTab={tab} files={pack.files}>
        <FileView files={pack.files} tab={tab} />
      </PackEditor>
    </Frame>
  );
}
