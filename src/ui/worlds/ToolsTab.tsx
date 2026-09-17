"use client";
// The Tools tab (design/agentsim-console.html `renderToolsTab`/`toolPaneHtml` 1809-1847): a rail
// of the pack's tools and a schema pane that follows the pointer and pins on click.
import { useState } from "react";
import type { EntitySpec, Scenario, ToolDef } from "@/engine/pack";
import { systemColor } from "@/ui/systemColor";
import { guardRows, inputRows, outputLabel } from "./toolPane";

export type ToolsTabProps = { tools: ToolDef[]; entities: Record<string, EntitySpec>; scenarios: Scenario[]; systems: string[] };

const KIND_CLASS = { enforced: "enf", graded: "grd", untrusted: "unt" } as const;

export function ToolsTab({ tools, entities, scenarios, systems }: ToolsTabProps) {
  const [pinned, setPinned] = useState(tools[0]?.name ?? "");
  const [hover, setHover] = useState<string | null>(null);
  const tool = tools.find((t) => t.name === (hover ?? pinned)) ?? tools[0];
  if (!tool) return <p className="hint" style={{ margin: 0 }}>This pack declares no tools.</p>;
  const colour = systemColor(systems, tool.system);
  const guards = guardRows(tool, entities, scenarios);

  return (
    <>
      <p className="hint">
        Hover a tool for its schema — input, output, and the guards on it. Click to pin. <b style={{ color: "var(--success-fg)" }}>enforced</b> guards the tool refuses itself;{" "}
        <b style={{ color: "var(--warning-fg)" }}>graded</b> guards it allows through and a Check catches after the fact.
      </p>
      <div className="tool-layout">
        <div className="tool-rail" onMouseLeave={() => setHover(null)}>
          {tools.map((t) => {
            const c = systemColor(systems, t.system);
            return (
              <button
                key={t.name}
                type="button"
                className={t.name === pinned && hover === null ? "active" : t.name === hover ? "active" : ""}
                aria-pressed={t.name === pinned}
                onMouseEnter={() => setHover(t.name)}
                onFocus={() => setHover(t.name)}
                onBlur={() => setHover(null)}
                onClick={() => setPinned(t.name)}
              >
                <span className="sys-dot" style={{ background: c.fg }} />
                <span className="nm">{t.name}</span>
                <span className={`wr${t.kind === "write" ? " w" : ""}`}>{t.kind}</span>
              </button>
            );
          })}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            <h3 className="mono" style={{ margin: 0, fontSize: 14 }}>{tool.name}</h3>
            <span className="system-chip" style={{ background: colour.bg, color: colour.fg, margin: 0 }}>{tool.system}</span>
            <span className={`pill-badge ${tool.kind === "write" ? "badge-warning" : "badge-neutral"}`}>{tool.kind === "write" ? "writes to the World" : "read-only"}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>{tool.op} {tool.collection}</span>
          </div>
          <p style={{ fontSize: 12.5, color: "var(--muted)", margin: "0 0 18px" }}>{tool.description}</p>

          <span className="field-label">Input</span>
          <div className="table-wrap" style={{ marginBottom: 18 }}>
            <table className="maptable">
              <thead>
                <tr><th>Param</th><th>Type</th><th></th><th>Notes</th></tr>
              </thead>
              <tbody>
                {inputRows(tool).map((r) => (
                  <tr key={r.name}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{r.name}</td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{r.type}</td>
                    <td>{r.required ? <span className="tag-xs">required</span> : <span className="tag-xs" style={{ background: "transparent", color: "var(--muted)" }}>optional</span>}</td>
                    <td style={{ fontSize: 11.5, color: "var(--muted)" }}>{r.notes}</td>
                  </tr>
                ))}
                {inputRows(tool).length === 0 && (
                  <tr><td colSpan={4} style={{ color: "var(--muted)", fontSize: 11.5 }}>No input — the call takes no arguments.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <span className="field-label">Output</span>
          <pre className="mono schema-pre">{outputLabel(tool, entities)}</pre>

          <span className="field-label">Guards</span>
          {guards.map((g, i) => (
            <div key={i} className="guard-row">
              <span className={`guard-kind ${KIND_CLASS[g.kind]}`}>{g.kind}</span>
              <span>{g.text}</span>
            </div>
          ))}
          {guards.length === 0 && <p className="hint" style={{ margin: 0 }}>No guards — the tool accepts any well-typed call, and no Check names it.</p>}
        </div>
      </div>
    </>
  );
}
