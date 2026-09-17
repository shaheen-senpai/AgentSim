import Link from "next/link";
import type { Agent } from "@/ui/types";
import { Icon } from "@/marketing/icons";
import { trustBand } from "./agentStats";
import { card, tag, trustText } from "./ui";

export type AgentActivity = { runs: number; trust: number | null };

export function SourceTag({ source }: { source: Agent["source"] }) {
  return (
    <span className={tag}>
      <Icon name={source === "mcp" ? "plug" : "pen"} className="mr-1.5 size-3" />
      {source === "mcp" ? "MCP" : "Manual"}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-label text-label-sm uppercase text-muted-foreground">{label}</dt>
      <dd className="mt-1 font-heading text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}

const MAX_TOOLS = 4;

/** One agent in the grid. `href` omitted renders a static preview (the create form uses it). */
export function AgentCard({ agent, activity, href, fresh = false, style }: { agent: Agent; activity: AgentActivity; href?: string; fresh?: boolean; style?: React.CSSProperties }) {
  const band = trustBand(activity.trust);
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <SourceTag source={agent.source} />
        {fresh && <span className="font-label text-label-sm uppercase text-primary">Just connected</span>}
      </div>
      <h3 className="mt-5 font-heading text-h3 font-semibold">{agent.name || "Untitled agent"}</h3>
      <p className="mt-2 line-clamp-2 min-h-[2.6em] text-caption text-muted-foreground">{agent.description || "No description yet."}</p>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Tools">
        {agent.tools.slice(0, MAX_TOOLS).map((t) => (
          <li key={t} className={tag}>{t}</li>
        ))}
        {agent.tools.length > MAX_TOOLS && <li className="self-center font-label text-[11px] text-muted-foreground">+{agent.tools.length - MAX_TOOLS}</li>}
        {agent.tools.length === 0 && <li className="font-label text-[11px] text-muted-foreground">No tools listed</li>}
      </ul>
      <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
        <Stat label="Trust"><span className={trustText[band]}>{activity.trust ?? "—"}</span></Stat>
        <Stat label="Worlds">{agent.worldIds.length}</Stat>
        <Stat label="Runs">{activity.runs}</Stat>
      </dl>
    </>
  );
  const classes = `${card} flex h-full flex-col p-5 ${fresh ? "animate-highlight border-primary/50" : ""}`;
  if (!href) return <div className={classes} style={style}>{body}</div>;
  return (
    <Link
      href={href}
      style={style}
      className={`${classes} animate-reveal transition-[transform,border-color] duration-300 ease-soft hover:-translate-y-0.5 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
    >
      {body}
    </Link>
  );
}

export function AgentRow({ agent, activity, href, fresh = false, style }: { agent: Agent; activity: AgentActivity; href: string; fresh?: boolean; style?: React.CSSProperties }) {
  const band = trustBand(activity.trust);
  return (
    <Link
      href={href}
      style={style}
      className={`${card} animate-reveal grid grid-cols-[1fr_auto] items-center gap-4 px-5 py-4 transition-colors duration-200 hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] ${fresh ? "animate-highlight border-primary/50" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        <SourceTag source={agent.source} />
        <span className="truncate font-heading text-body font-semibold">{agent.name}</span>
      </div>
      <p className="hidden truncate text-caption text-muted-foreground md:block">{agent.description}</p>
      <dl className="flex items-center gap-6 font-label text-[11px] uppercase text-muted-foreground">
        <div className="flex items-baseline gap-1.5"><dt>Tools</dt><dd className="text-foreground">{agent.tools.length}</dd></div>
        <div className="flex items-baseline gap-1.5"><dt>Worlds</dt><dd className="text-foreground">{agent.worldIds.length}</dd></div>
        <div className="flex items-baseline gap-1.5"><dt>Trust</dt><dd className={`text-body font-semibold ${trustText[band]}`}>{activity.trust ?? "—"}</dd></div>
      </dl>
    </Link>
  );
}
