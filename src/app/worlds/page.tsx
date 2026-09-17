// `/worlds` — every World pack on disk, plus any worldbuilder drafts awaiting review
// (design/agentsim-console.html 626-640, `renderWorldCards` 1363-1386, `draftRowHtml` 1956-1967).
import type { Metadata } from "next";
import Link from "next/link";
import { listDrafts } from "@/generate/draftRegistry";
import { summarizeDraft } from "@/lib/draftSummary";
import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { relativeTime } from "@/ui/relativeTime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "World · AgentSim Console" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function WorldsPage() {
  // `loadPacks` skips a pack hand-edited into an invalid state; this page says which, and why.
  const { packs, broken } = loadPacks();
  const drafts = listDrafts().map(summarizeDraft);
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request; one clock reading keeps every draft's age consistent
  const now = Date.now();

  return (
    <ConsoleShell>
      <section id="view-world">
        <div className="crumb">AgentSim</div>
        <div className="runs-toolbar" style={{ alignItems: "flex-start" }}>
          <div>
            <h1 className="page serif">World</h1>
            <p className="sub" style={{ marginBottom: 0 }}>The packs a Run happens inside — entities, ownership, tools, seed data.</p>
          </div>
          <Link href="/worlds/new" className="btn btn-primary">+ New world</Link>
        </div>

        {drafts.length > 0 && (
          <div className="panel card-pad" style={{ margin: "22px 0 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Worldbuilder drafts awaiting review — {drafts.length}</h2>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>One per plugin run. Drafts live in memory for two hours.</span>
            </div>
            {drafts.map((d) => (
              <div key={d.id} className="draft-row">
                <div style={{ minWidth: 0 }}>
                  <div>
                    <span className="draft-id">{d.id}</span>
                    <span className={`pill-badge ${d.valid ? "badge-warning" : "badge-danger"}`} style={{ marginLeft: 6 }}>
                      {d.valid ? "awaiting review" : plural(d.errorCount, "error", "errors")}
                    </span>
                  </div>
                  <div className="draft-meta">
                    {d.name} · {relativeTime(new Date(d.createdAt).toISOString(), now)} · {plural(d.tools, "tool", "tools")}, {plural(d.entities, "entity", "entities")} · new World
                  </div>
                </div>
                <div className="draft-actions">
                  <Link className="btn btn-ghost" style={{ height: 30, fontSize: 12 }} href={`/worlds/new?draft=${encodeURIComponent(d.id)}`}>Review →</Link>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="world-grid" style={{ marginTop: drafts.length > 0 ? 0 : 22 }}>
          {packs.map((p) => {
            const principal = p.meta.entities[p.meta.principal]?.label ?? p.meta.principal;
            return (
              <Link key={p.meta.id} href={`/worlds/${p.meta.id}`} className="world-card" style={{ display: "block" }}>
                <h3>{p.meta.name}</h3>
                <div className="domain">{p.meta.domain}</div>
                <p>{p.meta.description}</p>
                <div className="meta-row">
                  <span>{plural(Object.keys(p.meta.entities).length, "entity", "entities")}</span>
                  <span>Principal: {principal}</span>
                  <span>{plural(Object.keys(p.meta.systems).length, "system", "systems")}</span>
                  <span>{plural(Object.keys(p.tools).length, "tool", "tools")}</span>
                </div>
              </Link>
            );
          })}
        </div>

        {packs.length === 0 && broken.length === 0 && <p className="sub" style={{ marginTop: 22 }}>No World packs found under <span className="mono">worldpacks/</span>.</p>}

        {broken.length > 0 && (
          <div className="nw-note" style={{ borderLeftColor: "var(--danger-fg)", marginTop: 20 }}>
            <b>{plural(broken.length, "pack", "packs")} failed to load.</b>
            {broken.map((b) => (
              <div key={b.id} style={{ marginTop: 8 }}>
                <Link href={`/worlds/${b.id}/edit`} className="linkish" style={{ color: "var(--danger-fg)" }}>{b.id}</Link>
                <pre className="mono" style={{ whiteSpace: "pre-wrap", margin: "4px 0 0", fontSize: 11 }}>{b.message}</pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </ConsoleShell>
  );
}
