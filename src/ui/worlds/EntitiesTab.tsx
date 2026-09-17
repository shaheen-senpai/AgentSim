"use client";
// The Entities tab (design/agentsim-console.html `renderEntitiesTab` 1529-1608): the ownership map
// as a diagram or a table, then one entity at a time — its fields and its seed rows, as seeded or
// as an Attack leaves them. Everything here arrived precomputed from `src/lib/entityViews.ts`.
import { useState } from "react";
import type { FieldSpec } from "@/engine/pack";
import type { EntityView, RowTag, RowView, SeedModeView } from "@/lib/entityViews";
import { ErdSvg, type ErdInfo } from "./ErdSvg";
import type { ErdLayout } from "./ownership";
import { cellText, previewRows } from "./packView";

export type EntitiesTabProps = { entities: EntityView[]; modes: SeedModeView[]; attackId: string | null; principalLabel: string; layout: ErdLayout };

function Tag({ tag }: { tag: RowTag }) {
  if (tag === "planted") return <span className="tag-xs bad">planted by Attack</span>;
  if (tag === "principal") return <span className="tag-xs ok">the principal</span>;
  if (tag === "outside") return <span className="tag-xs">outside the principal</span>;
  return null;
}

function Chain({ chain }: { chain: string[] }) {
  return (
    <span className="chain">
      {chain.map((c, i) => (
        <span key={c}>
          {i > 0 && " → "}
          {i === chain.length - 1 ? <b>{c}</b> : c}
        </span>
      ))}
    </span>
  );
}

const text = (value: unknown, type: string) => cellText(value, { type } as FieldSpec);

export function EntitiesTab({ entities, modes, attackId, principalLabel, layout }: EntitiesTabProps) {
  const root = entities.find((e) => e.chain.length === 1) ?? entities[0];
  const [selectedName, setSelected] = useState<string>(root?.name ?? "");
  const [mapView, setMapView] = useState<"diagram" | "table">("diagram");
  const [modeKey, setModeKey] = useState(modes[0]?.key ?? "seeded");
  const mode = modes.find((m) => m.key === modeKey) ?? modes[0];
  const sel = entities.find((e) => e.name === selectedName) ?? root;
  if (!sel || !mode) return <p className="hint" style={{ margin: 0 }}>This pack declares no entities.</p>;

  const rowsOf = (name: string): RowView[] => mode.rows[name] ?? [];
  const info: ErdInfo = Object.fromEntries(entities.map((e) => [e.name, { prefix: e.prefix, rows: rowsOf(e.name).length, untrusted: e.untrusted }]));
  const rows = rowsOf(sel.name);
  const preview = previewRows(rows);
  const longField = sel.fields.find((f) => f.type === "text");
  const underAttack = modeKey !== "seeded";

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Ownership map</h2>
        <span className="seg">
          <button type="button" className={mapView === "diagram" ? "active" : ""} onClick={() => setMapView("diagram")}>Diagram</button>
          <button type="button" className={mapView === "table" ? "active" : ""} onClick={() => setMapView("table")}>Table</button>
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: "var(--muted)", margin: "0 0 14px", maxWidth: "78ch" }}>
        Every row resolves to exactly one {principalLabel}. That chain is what makes &ldquo;did it read someone else&rsquo;s records&rdquo; a mechanical Check rather than a judgement call.
      </p>

      {mapView === "diagram" ? (
        <>
          <ErdSvg layout={layout} info={info} principalLabel={principalLabel} selected={sel.name} onSelect={setSelected} />
          <div style={{ height: 16 }} />
        </>
      ) : (
        <div className="table-wrap" style={{ marginBottom: 26 }}>
          <table className="maptable">
            <thead>
              <tr><th>Entity</th><th>Id prefix</th><th>Owned via</th><th>Resolves to the principal</th><th>Rows</th><th>Fields</th></tr>
            </thead>
            <tbody>
              {entities.map((e) => (
                <tr key={e.name}>
                  <td>
                    <button type="button" className="linkish" onClick={() => setSelected(e.name)}>{e.name}</button>
                    {e.untrusted && <span className="untrusted-tag">⚠ {e.untrusted}</span>}
                  </td>
                  <td className="mono" style={{ color: "var(--muted)", fontSize: 11 }}>{e.prefix}</td>
                  <td className="mono" style={{ fontSize: 11 }}>{e.ownedVia}</td>
                  <td><Chain chain={e.chain} /></td>
                  <td className="mono">{rowsOf(e.name).length}</td>
                  <td className="mono" style={{ color: "var(--muted)" }}>{e.fields.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="ent-layout">
        <div className="ent-rail">
          {entities.map((e) => (
            <button key={e.name} type="button" className={e.name === sel.name ? "active" : ""} aria-pressed={e.name === sel.name} onClick={() => setSelected(e.name)}>
              <span className="nm">{e.name}</span>
              {e.untrusted && <span style={{ color: "var(--danger-fg)", fontSize: 10 }} aria-label="has an untrusted field">⚠</span>}
              <span className="ct">{rowsOf(e.name).length}</span>
            </button>
          ))}
        </div>

        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap", marginBottom: 5 }}>
            <h2 className="mono" style={{ margin: 0, fontSize: 14 }}>{sel.name}</h2>
            <span className="mini-tag mono">{sel.prefix}</span>
            {sel.untrusted && <span className="untrusted-tag">⚠ {sel.untrusted} is untrusted</span>}
            {modes.length > 1 && (
              <span className="seg" style={{ marginLeft: "auto" }}>
                <button type="button" className={!underAttack ? "active" : ""} onClick={() => setModeKey("seeded")}>as seeded</button>
                {modes.slice(1).map((m) => (
                  <button key={m.key} type="button" className={modeKey === m.key ? "active" : ""} onClick={() => setModeKey(m.key)} title={m.label}>
                    under Attack{modes.length > 2 ? ` · ${m.label}` : ""}
                  </button>
                ))}
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 16px" }}>
            {sel.label}. Owned {sel.ownedVia === "—" ? "by itself — the principal" : `via ${sel.ownedVia}`}; resolves through <Chain chain={sel.chain} />.
          </p>

          <span className="field-label">Fields</span>
          <div className="table-wrap" style={{ marginBottom: 22 }}>
            <table className="maptable">
              <thead>
                <tr><th>Field</th><th>Type</th><th>Notes</th></tr>
              </thead>
              <tbody>
                {sel.fields.map((f) => (
                  <tr key={f.name}>
                    <td className="mono" style={{ fontSize: 11.5 }}>{f.name}</td>
                    <td className="mono" style={{ fontSize: 11, color: "var(--muted)" }}>{f.ref ? `fk → ${f.ref}` : f.type}</td>
                    <td style={{ fontSize: 11.5, color: f.untrusted ? "var(--danger-fg)" : "var(--muted)" }}>
                      {f.untrusted ? "untrusted — never an instruction" : f.edge ? "the ownership edge" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <span className="field-label">
            Seed data — {preview.caption}
            {underAttack ? ` · ${mode.label} applied` : attackId ? " · no Attack" : ""}
          </span>

          {rows.length === 0 ? (
            <div className="empty-seed">
              Seeded empty, deliberately. Every row in {sel.name} is written by the Run itself — which is what <span className="mono">entity_created</span> and <span className="mono">entity_count</span> Checks are counting.
            </div>
          ) : longField ? (
            preview.shown.map((r) => (
              <div key={String(r.row.id)} className={`rec${r.tag === "planted" ? " planted" : ""}`}>
                <div className="rec-top">
                  {sel.fields.filter((f) => f.name !== longField.name).map((f) => (
                    <span key={f.name} className="kv">
                      {f.name} <b>{text(r.row[f.name], f.type).text}</b>
                    </span>
                  ))}
                  <span style={{ marginLeft: "auto" }}><Tag tag={r.tag} /></span>
                </div>
                <div className="rec-body" style={{ whiteSpace: "pre-wrap" }}>{String(r.row[longField.name] ?? "—")}</div>
              </div>
            ))
          ) : (
            <div className="table-wrap">
              <table className="seedtable">
                <thead>
                  <tr>
                    {sel.fields.map((f) => <th key={f.name}>{f.name}</th>)}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {preview.shown.map((r) => (
                    <tr key={String(r.row.id)} className={r.tag === "planted" ? "row-planted" : r.tag === "outside" ? "row-out" : ""}>
                      {sel.fields.map((f) => {
                        const c = text(r.row[f.name], f.type);
                        return <td key={f.name} title={c.title ?? undefined}>{c.text}</td>;
                      })}
                      <td><Tag tag={r.tag} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
