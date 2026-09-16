// The Tools tab: a card per tool from `tools.yaml`, in declaration order. Guards are printed
// verbatim — the `when` expression and the error the World throws — because a guard is the World's
// own rule, and a Run is graded partly on whether the agent respects it.
import type { PackMeta, ToolDef } from "@/engine/pack";
import { heading, mono } from "@/ui/styles";
import { systemColor } from "@/ui/systemColor";
import { fieldLabel, opLabel } from "./packView";

function Card({ tool, systems, systemLabel }: { tool: ToolDef; systems: string[]; systemLabel: string }) {
  const colour = systemColor(systems, tool.system);
  const write = tool.kind === "write";
  return (
    <article className="bg-white border border-[#E3E0D5] rounded flex overflow-hidden">
      <div aria-hidden="true" className="w-1 shrink-0" style={{ background: colour.stripe }} />
      <div className="flex flex-col gap-2 p-3 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className={`${mono} font-semibold text-[13px]`}>{tool.name}</h2>
          <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: colour.bg, color: colour.fg }}>
            {systemLabel}
          </span>
          <span className={`text-[10px] rounded-full px-2 py-0.5 border ${write ? "border-[#1B1A17] text-[#1B1A17] font-semibold" : "border-[#E3E0D5] text-[#6E6B60]"}`}>
            {tool.kind}
          </span>
          <span className={`${mono} text-[11px] text-[#6E6B60]`}>{opLabel(tool)}</span>
        </div>

        <p className="text-[12px] leading-snug">{tool.description}</p>

        <div>
          <div className={heading}>Input</div>
          <ul className="flex flex-wrap gap-1.5 mt-1">
            {Object.entries(tool.input).map(([name, spec]) => (
              <li key={name} className={`${mono} text-[11px] border border-[#E3E0D5] rounded px-1.5 py-0.5`}>
                {fieldLabel(name, spec)}
              </li>
            ))}
            {Object.keys(tool.input).length === 0 && <li className="text-[11px] text-[#6E6B60]">no arguments</li>}
          </ul>
        </div>

        {tool.guards && tool.guards.length > 0 && (
          <div>
            <div className={heading}>Guards</div>
            <ul className="flex flex-col gap-1 mt-1">
              {tool.guards.map((g, i) => (
                <li key={`${i}-${g.when}`} className="border border-[#E3E0D5] rounded p-1.5">
                  <div className={`${mono} text-[11px] break-all`}>{g.when}</div>
                  <div className="text-[11px] text-[#B23A22] break-words">{g.error}</div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {tool.returns !== undefined && (
          <div>
            <div className={heading}>Returns</div>
            <pre className={`${mono} text-[11px] mt-1 p-1.5 bg-[#F7F5EF] border border-[#E3E0D5] rounded overflow-x-auto`}>
              {JSON.stringify(tool.returns, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </article>
  );
}

export function ToolCards({ meta, tools }: { meta: PackMeta; tools: Record<string, ToolDef> }) {
  const systems = Object.keys(meta.systems);
  const entries = Object.entries(tools);
  if (entries.length === 0) return <p className="text-[13px] text-[#6E6B60]">This World pack declares no tools.</p>;
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
      {entries.map(([name, tool]) => (
        <Card key={name} tool={tool} systems={systems} systemLabel={meta.systems[tool.system]?.label ?? tool.system} />
      ))}
    </div>
  );
}
