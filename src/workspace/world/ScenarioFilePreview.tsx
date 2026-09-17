// A proposed scenario file, shown before it is saved. The YAML is printed as the model wrote it,
// but the planted Attack is not allowed to hide in it: the `attacks:` block is cut out and drawn as
// its own red-edged region with a label, and a clean file gets a green note on its empty list.
import { Icon } from "@/marketing/icons";
import { attackCountOf, scenarioKind, splitAttackBlock } from "@/ui/worlds/scenarioKind";

const pre = "overflow-auto p-4 font-label text-[11.5px] leading-relaxed text-foreground";

export function ScenarioFilePreview({ text }: { text: string }) {
  const count = attackCountOf(text);
  const { before, attacks } = splitAttackBlock(text);
  const attacked = (count ?? 0) > 0;

  return (
    <div className="mt-1.5 max-h-[520px] overflow-auto rounded-control border border-border bg-surface">
      <pre className={pre}>{before}</pre>
      {attacks !== null && (
        <div className={attacked ? "border-t-2 border-danger/60 bg-danger/[0.06]" : "border-t border-safe/40 bg-safe/[0.06]"}>
          <p className={`flex items-center gap-2 px-4 pt-3 font-label text-[11px] uppercase tracking-wide ${attacked ? "text-danger" : "text-safe"}`}>
            <Icon name={attacked ? "alert" : "shield"} className="size-3.5" />
            {attacked ? `${scenarioKind(count ?? 0).label} — this text is planted in a record the task reads` : "Clean — no Attack; this Scenario grades the honest path alone"}
          </p>
          <pre className={`${pre} ${attacked ? "border-l-[3px] border-l-danger" : ""}`}>{attacks}</pre>
        </div>
      )}
    </div>
  );
}
