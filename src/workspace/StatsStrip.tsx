import type { WorkspaceStats } from "./agentStats";
import { CountUp } from "./CountUp";
import { card, eyebrow } from "./ui";

export function StatsStrip({ stats }: { stats: WorkspaceStats }) {
  const cells = [
    { label: "Agents", value: <CountUp value={stats.agents} />, sub: `${stats.viaMcp} via MCP` },
    { label: "Worlds", value: <CountUp value={stats.worlds} />, sub: "attached & replayable" },
    { label: "Shifts run", value: <CountUp value={stats.shifts} />, sub: "clean + poisoned" },
    { label: "Avg trust", value: stats.avgTrust === null ? "—" : <CountUp value={stats.avgTrust} />, sub: stats.avgTrust === null ? "no scored shifts yet" : "across scored agents" },
  ];
  return (
    <dl className={`${card} grid grid-cols-2 divide-border md:grid-cols-4 md:divide-x`}>
      {cells.map((c) => (
        <div key={c.label} className="px-5 py-4">
          <dt className={eyebrow}>{c.label}</dt>
          <dd className="mt-1 font-heading text-xl font-semibold tabular-nums">{c.value}</dd>
          <dd className="mt-0.5 font-label text-[11px] text-muted-foreground">{c.sub}</dd>
        </div>
      ))}
    </dl>
  );
}
