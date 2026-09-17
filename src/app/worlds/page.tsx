// `/worlds` — every World pack on disk, with the draft ones queued for review at the top
// (design/agentsim-console.html 626-640, `renderWorldCards`, `worldReviewRowHtml`).
//
// A draft World is one the worldbuilder plugin built, or one composed here, that nobody has read
// yet: it cannot be run until someone publishes it on its own page.
import type { Metadata } from "next";
import Link from "next/link";
import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { relativeTime } from "@/ui/relativeTime";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "World · AgentSim Console" };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export default function WorldsPage() {
  // `loadPacks` skips a pack hand-edited into an invalid state; this page says which, and why.
  const { packs, broken } = loadPacks();
  const review = packs.filter((p) => p.meta.status === "draft");
  // eslint-disable-next-line react-hooks/purity -- a Server Component renders once per request; one clock reading keeps every draft's age consistent
  const now = Date.now();

  return (
    <ConsoleShell>
      <section id="view-world">
        <Link className="back-link" href="/agents">← Agents</Link>
        <div className="crumb">AgentSim</div>
        <div className="runs-toolbar" style={{ alignItems: "flex-start" }}>
          <div>
            <h1 className="page serif">World</h1>
            <p className="sub" style={{ marginBottom: 0 }}>The packs a Run happens inside — entities, ownership, tools, seed data.</p>
          </div>
          <Link href="/worlds/new" className="btn btn-primary">+ New world</Link>
        </div>

        {review.length > 0 && (
          <div className="panel card-pad" style={{ margin: "22px 0 20px" }}>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Worlds awaiting review — {review.length}</h2>
              <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Nothing can be run against one until it is published.</span>
            </div>
            {review.map((p) => {
              const built = p.meta.built_by;
              return (
                <div key={p.meta.id} className="draft-row">
                  <div style={{ minWidth: 0 }}>
                    <div>
                      <span className="draft-id">{p.meta.id}</span>
                      <span className="pill-badge badge-warning" style={{ marginLeft: 6 }}>awaiting review</span>
                    </div>
                    <div className="draft-meta">
                      {built?.repo ?? (built?.source === "plugin" ? "no repo recorded" : "composed here")}
                      {built?.client ? ` · ${built.client}` : ""}
                      {built ? ` · ${relativeTime(built.at, now)}` : ""} · {plural(Object.keys(p.tools).length, "tool", "tools")},{" "}
                      {plural(Object.keys(p.meta.entities).length, "entity", "entities")} ·{" "}
                      {p.scenarios.length > 0 ? plural(p.scenarios.length, "Scenario", "Scenarios") : "no Scenarios yet"}
                    </div>
                  </div>
                  <div className="draft-actions">
                    {built?.token && <span className="mono" style={{ fontSize: 10.5, color: "var(--muted)" }}>{built.token}</span>}
                    <Link className="btn btn-ghost" style={{ height: 30, fontSize: 12 }} href={`/worlds/${p.meta.id}`}>Review →</Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="world-grid" style={{ marginTop: review.length > 0 ? 0 : 22 }}>
          {packs.map((p) => {
            const principal = p.meta.entities[p.meta.principal]?.label ?? p.meta.principal;
            return (
              <Link key={p.meta.id} href={`/worlds/${p.meta.id}`} className="world-card" style={{ display: "block" }}>
                <h3>
                  {p.meta.name}
                  {p.meta.status === "draft" && <span className="pill-badge badge-warning" style={{ marginLeft: 8, verticalAlign: "middle" }}>draft</span>}
                </h3>
                <div className="domain">{p.meta.domain}</div>
                <p>{p.meta.description}</p>
                <div className="meta-row">
                  <span>{plural(Object.keys(p.meta.entities).length, "entity", "entities")}</span>
                  <span>Principal: {principal}</span>
                  <span>{plural(Object.keys(p.meta.systems).length, "system", "systems")}</span>
                  <span>{plural(Object.keys(p.tools).length, "tool", "tools")}</span>
                  <span>{plural(p.scenarios.length, "Scenario", "Scenarios")}</span>
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
