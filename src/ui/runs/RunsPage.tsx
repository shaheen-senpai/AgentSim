"use client";
// The Runs view (design/agentsim-console.html lines 526-564, row template 1070-1078). Every value
// arrives precomputed in a `RunRow`; this component only lays it out. A client component so the
// whole row navigates on click — the Run cell's <Link> is the one tab stop a keyboard user needs.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { verdictBadgeClass } from "@/ui/verdict";
import type { Insight, RunRow } from "./runsView";

const TONE: Record<Insight["tone"], { bg: string; fg: string }> = {
  warning: { bg: "var(--warning-bg)", fg: "var(--warning-fg)" },
  success: { bg: "var(--success-bg)", fg: "var(--success-fg)" },
  danger: { bg: "var(--danger-bg)", fg: "var(--danger-fg)" },
};

function InsightCard({ insight }: { insight: Insight }) {
  const tone = TONE[insight.tone];
  const body = (
    <>
      <div className="icon" style={{ background: tone.bg, color: tone.fg }}>{insight.icon}</div>
      <h3>
        {insight.title}
        {insight.href && <span style={{ fontWeight: 400, color: "var(--muted)" }}> →</span>}
      </h3>
      <p>{insight.detail}</p>
    </>
  );
  return insight.href ? (
    <Link href={insight.href} className="panel insight" style={{ textAlign: "left" }}>{body}</Link>
  ) : (
    <div className="panel insight">{body}</div>
  );
}

export function RunsPage({ rows, subline, insights }: { rows: RunRow[]; subline: string; insights: Insight[] }) {
  const router = useRouter();
  return (
    <section id="view-runs">
      <Link className="back-link" href="/agents">← Agents</Link>
      <div className="crumb">AgentSim</div>
      <h1 className="page serif">Runs</h1>
      <p className="sub">{subline}</p>

      <div className="runs-toolbar">
        <div />
        <Link href="/runs/new" className="btn btn-primary">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M8 5v14l11-7z" /></svg>
          New run
        </Link>
      </div>

      <div className="panel table-wrap runs-scroll">
        <table className="runs">
          <thead>
            <tr>
              <th>Run</th>
              <th>Scenario</th>
              <th className="c-agent">Agent</th>
              <th className="c-attack">Attack</th>
              <th>Trust</th>
              <th className="c-when">When</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const dimTitle = r.dims.map((d) => `${d.label} ${d.score}`).join(" · ");
              return (
                <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => router.push(`/runs/${r.id}`)}>
                  <td title={r.name}>
                    <Link href={`/runs/${r.id}`} onClick={(e) => e.stopPropagation()}>
                      <div className="run-name">{r.name}</div>
                      <div className="run-id mono">{r.id}</div>
                    </Link>
                  </td>
                  <td title={r.scenarioShort}>
                    <div className="cell-main">{r.scenarioShort}</div>
                    <div className="cell-sub">{r.packName}</div>
                  </td>
                  <td className="c-agent" title={r.agentLabel}>{r.agentLabel}</td>
                  <td className="c-attack" title={r.attackId ?? "no Attack"}>
                    <div className={`attack-cell${r.attackId ? "" : " off"}`}>{r.attackId ?? "— none"}</div>
                  </td>
                  <td title={dimTitle}>
                    <div className="trust">
                      <span className={`n${r.capped ? " num-bad" : ""}`}>{r.status === "running" ? "…" : r.headline ?? "—"}</span>
                      {r.verdict.tone === "muted" ? (
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{r.verdict.text}</span>
                      ) : (
                        <span className={`pill-badge ${verdictBadgeClass(r.verdict.tone)}`}>{r.verdict.text.toUpperCase()}</span>
                      )}
                    </div>
                    <div className="dimstrip">
                      {r.dims.map((d) => <span key={d.label} className={`dimseg${d.score < 100 ? " bad" : ""}`} />)}
                    </div>
                  </td>
                  <td className="c-when" style={{ color: "var(--muted)" }}>{r.when}</td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ textAlign: "center", padding: "32px 14px", color: "var(--muted)" }}>No runs yet — start one to see it here.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {insights.length > 0 && (
        <div className="insight-row">
          {insights.map((i) => <InsightCard key={i.title} insight={i} />)}
        </div>
      )}
    </section>
  );
}
