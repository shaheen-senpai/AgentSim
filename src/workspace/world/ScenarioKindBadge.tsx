// The one badge that says whether a Scenario carries a planted Attack. Filled, not just coloured
// text: the difference between a clean shift and one with a lure in it is the first thing a reader
// should see on a Scenario, before its title.
import { Icon } from "@/marketing/icons";
import { scenarioKind } from "@/ui/worlds/scenarioKind";

const styles = {
  attacked: "border-danger/40 bg-danger/10 text-danger",
  clean: "border-safe/40 bg-safe/10 text-safe",
} as const;

export function ScenarioKindBadge({ attacks, className = "" }: { attacks: number; className?: string }) {
  const { kind, label } = scenarioKind(attacks);
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-1 font-label text-[11px] uppercase leading-none tracking-wide ${styles[kind]} ${className}`}>
      <Icon name={kind === "attacked" ? "alert" : "shield"} className="size-3" />
      {label}
    </span>
  );
}

/** The left edge of a Scenario card: a red rule on an attacked one, so a grid reads at a glance. */
export function kindEdge(attacks: number): string {
  return attacks > 0 ? "border-l-[3px] border-l-danger" : "border-l-[3px] border-l-safe/60";
}
