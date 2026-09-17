"use client";
// The ownership graph, drawn (design/agentsim-console.html `erdSvg` 1473-1527): one box per
// entity in columns by depth, an edge per `via` hop labelled with the field, the principal filled,
// untrusted entities dashed. Clicking a box selects it.
import { ERD, type ErdLayout } from "./ownership";

export type ErdInfo = Record<string, { prefix: string; rows: number; untrusted: string | null }>;

export function ErdSvg({ layout, info, principalLabel, selected, onSelect }: { layout: ErdLayout; info: ErdInfo; principalLabel: string; selected: string | null; onSelect: (name: string) => void }) {
  return (
    <figure style={{ margin: "0 0 10px" }}>
      <div className="erd-wrap">
        <svg className="erd" viewBox={`0 0 ${layout.width} ${layout.height}`} width={layout.width} role="img" aria-label={`Ownership graph: every entity in this World resolves through its foreign keys to one ${principalLabel}.`}>
          <defs>
            <marker id="erdArrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L8 4 L0 8 z" fill="currentColor" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const hot = e.from === selected || e.to === selected;
            const lw = e.via.length * 5.6 + 10;
            const ly = (e.y1 + e.y2) / 2;
            return (
              <g key={`${e.from}-${e.via}`}>
                <path className={`erd-edge${hot ? " hot" : ""}`} d={`M${e.x1} ${e.y1} C${e.mx} ${e.y1}, ${e.mx} ${e.y2}, ${e.x2} ${e.y2}`} markerEnd="url(#erdArrow)" />
                <rect className="erd-lbl-bg" x={e.mx - lw / 2} y={ly - 7} width={lw} height={14} rx={4} />
                <text className="erd-lbl" x={e.mx} y={ly + 3} textAnchor="middle">{e.via}</text>
              </g>
            );
          })}
          {layout.nodes.map((n) => {
            const i = info[n.name];
            const rows = i?.rows ?? 0;
            const cls = `erd-node${n.root ? " root" : ""}${i?.untrusted ? " untrusted" : ""}${n.name === selected ? " sel" : ""}`;
            return (
              <g
                key={n.name}
                className={cls}
                role="button"
                tabIndex={0}
                aria-label={`${n.name}, ${rows} row${rows === 1 ? "" : "s"}`}
                onClick={() => onSelect(n.name)}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    onSelect(n.name);
                  }
                }}
              >
                <rect x={n.x} y={n.y} width={ERD.NW} height={ERD.NH} rx={10} />
                <text className="n" x={n.x + 13} y={n.y + 24}>{n.name}</text>
                <text className="s" x={n.x + 13} y={n.y + 41}>
                  {i?.prefix ?? "—"} · {rows} row{rows === 1 ? "" : "s"}{n.root ? " · the principal" : ""}
                </text>
                {i?.untrusted && <text className="u" x={n.x + 13} y={n.y + 55}>⚠ {i.untrusted} is untrusted</text>}
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="erd-cap">
        <span className="erd-key"><i /> owns, through that foreign key</span>
        <span className="erd-key"><i className="dash" /> holds an untrusted field — where an Attack can plant text</span>
        <span>Click an entity for its schema and seed rows.</span>
      </figcaption>
    </figure>
  );
}
