// The Overview tab's map of a World pack's entity model (spec §6.2). All geometry comes from
// `entityLayout.ts`, which is pure and unit-tested; this file only draws it.
//
// Two things the map is trying to say, and why they are drawn the way they are:
//   • the **principal** collection (2 px stroke + a "principal" marker) is where every row's
//     ownership chain ends — the arrows are the `ref` fields you follow to get there;
//   • an **untrusted** field (red, under its box) is an injection surface: content a customer,
//     a ticket or an inbox wrote, which an Attack can plant text in. Saying so plainly is the
//     point of the map, so it is also spelled out in the text list below the SVG.
//
// The SVG carries `role="img"` and an `aria-label`, and everything in it is repeated as text
// underneath — the map is never the only way to read this.
import type { PackMeta, ToolDef } from "@/engine/pack";
import { heading, mono } from "@/ui/styles";
import { systemColor } from "@/ui/systemColor";
import { arrowMidpoint, arrowPath, entityMapLabel, layoutEntityMap, type EntityBox } from "./entityLayout";
import { systemCounts } from "./packView";

const RULE = "#E3E0D5";
const INK = "#1B1A17";
const MUTED = "#6E6B60";
const RED = "#B23A22";
const ARROWHEAD = "entity-map-arrowhead";

/**
 * Arrow labels sit in a 60 px column gutter, so they are set small on purpose: at 8.5 px a field
 * name as long as `customer_id` still clears both boxes it runs between.
 */
const LABEL_SIZE = 8.5;

/** Rough width of a label at `LABEL_SIZE`, for the white backdrop behind an arrow's field name. */
const textWidth = (s: string) => s.length * LABEL_SIZE * 0.55;

function Box({ box }: { box: EntityBox }) {
  return (
    <g>
      <rect
        x={box.x}
        y={box.y}
        width={box.w}
        height={box.h}
        rx={4}
        fill="#fff"
        stroke={box.principal ? INK : RULE}
        strokeWidth={box.principal ? 2 : 1}
      />
      <text x={box.x + 12} y={box.y + 22} fontSize={12.5} fontWeight={600} fill={INK}>
        {box.label}
      </text>
      <text x={box.x + box.w - 12} y={box.y + 22} fontSize={10.5} fill={MUTED} textAnchor="end">
        {box.rows} {box.rows === 1 ? "row" : "rows"}
      </text>
      <text x={box.x + 12} y={box.y + 40} fontSize={10} fill={MUTED} fontFamily="ui-monospace, monospace">
        {box.collection}
      </text>
      {box.principal && (
        <text x={box.x + box.w - 12} y={box.y + 40} fontSize={9} fill={INK} textAnchor="end" letterSpacing={0.6}>
          principal
        </text>
      )}
      {box.untrusted.length > 0 && (
        <text x={box.x + 12} y={box.y + box.h + 13} fontSize={9.5} fill={RED}>
          untrusted: {box.untrusted.join(", ")}
        </text>
      )}
    </g>
  );
}

export function EntityMap({ meta, rowCounts, tools }: { meta: PackMeta; rowCounts: Record<string, number>; tools: Record<string, ToolDef> }) {
  const layout = layoutEntityMap({ entities: meta.entities, rowCounts, principal: meta.principal });
  const systems = Object.keys(meta.systems);
  const counts = systemCounts(meta, tools);

  // The refs out of each collection, for the text alternative under the map.
  const refsOut = new Map<string, { field: string; to: string }[]>();
  for (const a of layout.arrows) refsOut.set(a.from, [...(refsOut.get(a.from) ?? []), { field: a.field, to: a.to }]);

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h2 className={heading}>Entity model</h2>
        <div className="overflow-x-auto">
          <svg
            role="img"
            aria-label={entityMapLabel(layout)}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
          >
            <defs>
              {/* Muted, not rule-grey: which way an arrow points is the whole claim the map makes. */}
              <marker id={ARROWHEAD} viewBox="0 0 8 8" refX={7} refY={4} markerWidth={7} markerHeight={7} orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" fill={MUTED} />
              </marker>
            </defs>
            {layout.arrows.map((a) => {
              const mid = arrowMidpoint(a);
              const w = textWidth(a.field);
              return (
                <g key={a.id}>
                  <path d={arrowPath(a)} fill="none" stroke={MUTED} strokeWidth={1} markerEnd={`url(#${ARROWHEAD})`} />
                  <rect x={mid.x - w / 2 - 2} y={mid.y - 6.5} width={w + 4} height={12} rx={2} fill="#fff" />
                  <text x={mid.x} y={mid.y + 2.5} fontSize={LABEL_SIZE} fill={MUTED} textAnchor="middle" fontFamily="ui-monospace, monospace">
                    {a.field}
                  </text>
                </g>
              );
            })}
            {layout.boxes.map((b) => (
              <Box key={b.collection} box={b} />
            ))}
          </svg>
        </div>
        <p className="text-[11px] text-[#6E6B60]">
          Arrows point along a <span className={mono}>ref</span> field, from the collection that holds it to the collection it names — the same
          hops <span className={mono}>owner: {"{ via }"}</span> follows to reach the principal.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Collections</h2>
        <ul className="flex flex-col gap-1 text-[12px]">
          {layout.boxes.map((b) => {
            const refs = refsOut.get(b.collection) ?? [];
            return (
              <li key={b.collection} className="border-b border-[#E3E0D5] pb-1">
                <span className="font-semibold">{b.label}</span>{" "}
                <span className={`${mono} text-[#6E6B60]`}>{b.collection}</span>{" "}
                <span className="text-[#6E6B60]">
                  · {b.rows} {b.rows === 1 ? "row" : "rows"}
                </span>
                {b.principal && <span className="ml-1 text-[10px] border border-[#1B1A17] rounded-full px-1.5 py-0.5">principal</span>}
                {refs.length > 0 && (
                  <span className="text-[#6E6B60]">
                    {" · references "}
                    {refs.map((r) => `${r.to} via ${r.field}`).join(", ")}
                  </span>
                )}
                {b.untrusted.length > 0 && (
                  <span className="text-[#B23A22]">
                    {" · untrusted "}
                    {b.untrusted.join(", ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-[#6E6B60]">
          An <span className="text-[#B23A22]">untrusted</span> field holds content the World did not write — the surface an Attack plants text in.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className={heading}>Systems</h2>
        <ul className="flex flex-wrap gap-2">
          {counts.map((s) => {
            const colour = systemColor(systems, s.system);
            return (
              <li
                key={s.system}
                className="flex items-center gap-2 text-[12px] border border-[#E3E0D5] rounded px-2 py-1"
                style={{ background: colour.bg }}
              >
                <span aria-hidden="true" className="inline-block w-1 h-4 rounded-sm" style={{ background: colour.stripe }} />
                <span className="font-semibold" style={{ color: colour.fg }}>
                  {s.label}
                </span>
                <span className={`${mono} text-[10px] text-[#6E6B60]`}>{s.system}</span>
                <span className="text-[#6E6B60]">
                  {s.tools} {s.tools === 1 ? "tool" : "tools"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
