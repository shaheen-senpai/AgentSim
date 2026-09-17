// The World's Overview tab (design/agentsim-console.html 1408-1427): one source row per System
// (kind, mode, provider, tool count), the System chips, and the principal.
import type { PackMeta, ToolDef } from "@/engine/pack";
import { systemColor } from "@/ui/systemColor";
import { sourceDetail, sourceKindLabel, systemCounts } from "./packView";

export function OverviewTab({ meta, tools }: { meta: PackMeta; tools: Record<string, ToolDef> }) {
  const counts = systemCounts(meta, tools);
  const keys = Object.keys(meta.systems);
  const principalLabel = meta.entities[meta.principal]?.label ?? meta.principal;
  const built = meta.built_by;
  return (
    <>
      {built && (
        <div className="built-row">
          Built {built.source === "plugin" ? "by the worldbuilder plugin" : "in the console"}
          {built.run && <> · run <span className="mono">{built.run}</span></>}
          {built.repo && <> · <span className="mono">{built.repo}</span></>}
          {built.client && <> · {built.client}</>}
          {built.token && <> · token <span className="mono">{built.token}</span></>}
          <> · {built.at.slice(0, 10)}</>
        </div>
      )}
      <h2>What this World is made of</h2>
      <p style={{ fontSize: 12, color: "var(--muted)", margin: "-8px 0 14px" }}>
        A World is the union of everything the agent can reach — third-party MCPs, the team&rsquo;s own tools, a database, a bucket. Each source contributes its own Systems, tools and entities into one ownership graph.
      </p>
      <div className="src-list">
        {counts.map((c) => {
          const sys = meta.systems[c.system];
          const colour = systemColor(keys, c.system);
          return (
            <div key={c.system} className="src-item">
              <span className="src-kind" style={{ background: colour.bg, color: colour.fg }}>{sourceKindLabel(sys.kind)}</span>
              <div style={{ minWidth: 0 }}>
                <div className="src-name">
                  {c.label}
                  {sys.mode && <span className="src-mode">{sys.mode}</span>}
                </div>
                <div className="src-detail">{sourceDetail(sys)}</div>
              </div>
              <span className="src-count">{c.tools} tool{c.tools === 1 ? "" : "s"}</span>
            </div>
          );
        })}
      </div>

      <h2 style={{ marginTop: 22 }}>Systems</h2>
      {counts.map((c) => {
        const colour = systemColor(keys, c.system);
        return (
          <span key={c.system} className="system-chip" style={{ background: colour.bg, color: colour.fg }}>
            {c.label} · {c.tools}
          </span>
        );
      })}

      <h2 style={{ marginTop: 20 }}>Principal</h2>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
        Every row in this World resolves to one <b style={{ color: "var(--ink)" }}>{principalLabel}</b> — that ownership chain is what makes &ldquo;did the agent read someone else&rsquo;s records&rdquo; a mechanical Check.
      </p>
    </>
  );
}
