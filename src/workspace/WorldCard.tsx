import Link from "next/link";
import { Icon } from "@/marketing/icons";
import { card, tag } from "./ui";
import type { WorldView } from "./worlds";

export function WorldCard({ world, onRemove, fresh = false, style }: { world: WorldView; onRemove?: () => void; fresh?: boolean; style?: React.CSSProperties }) {
  return (
    <article
      className={`${card} animate-reveal relative flex h-full flex-col p-5 transition-[transform,border-color] duration-300 ease-soft hover:-translate-y-0.5 hover:border-primary/40 focus-within:border-primary/60 ${fresh ? "animate-highlight border-primary/50" : ""}`}
      style={style}
    >
      {/* The whole card opens the World; the controls below sit above this overlay. */}
      <Link href={world.href} aria-label={`Open ${world.name}`} className="absolute inset-0 rounded-panel focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" />
      <div className="flex items-center justify-between gap-3">
        <span className={tag}><Icon name="globe" className="mr-1.5 size-3" /> {world.domain || "world"}</span>
        <span className="font-label text-[11px] uppercase text-muted-foreground">{fresh ? <span className="text-primary">Just added</span> : world.kind === "draft" ? "Drafted" : world.status === "draft" ? "Draft pack" : "Installed pack"}</span>
      </div>
      <h3 className="mt-4 font-heading text-h3 font-semibold">{world.name}</h3>
      <p className="mt-2 line-clamp-3 text-caption text-muted-foreground">{world.description}</p>
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-border pt-4">
        {[["Scenarios", world.scenarios], ["Tools", world.tools], ["Rows", world.rows]].map(([label, value]) => (
          <div key={label}>
            <dt className="font-label text-label-sm uppercase text-muted-foreground">{label}</dt>
            <dd className="mt-1 font-heading text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="relative z-10 mt-5 flex flex-wrap items-center gap-3 text-caption">
        <span className="inline-flex items-center gap-1 text-primary">Open world <Icon name="arrow-right" className="size-3.5" /></span>
        {world.kind === "pack" && world.status !== "draft" ? (
          <Link href="/runs/new" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">Run a shift</Link>
        ) : (
          <span className="text-muted-foreground">{world.kind === "pack" ? "Publish to run shifts" : "Draft"}</span>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} className="ml-auto cursor-pointer text-muted-foreground underline-offset-4 hover:text-danger hover:underline focus-visible:outline-2 focus-visible:outline-ring">
            {world.kind === "draft" ? "Delete" : "Detach"}
          </button>
        )}
      </div>
    </article>
  );
}
