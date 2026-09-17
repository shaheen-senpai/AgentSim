import Link from "next/link";
import type { PackSummary } from "@/ui/types";
import { Icon } from "@/marketing/icons";
import { card, tag } from "./ui";

export function WorldCard({ world, onDetach, style }: { world: PackSummary; onDetach?: () => void; style?: React.CSSProperties }) {
  return (
    <article className={`${card} animate-reveal flex h-full flex-col p-5 transition-[transform,border-color] duration-300 ease-soft hover:-translate-y-0.5 hover:border-primary/40`} style={style}>
      <div className="flex items-center justify-between gap-3">
        <span className={tag}><Icon name="globe" className="mr-1.5 size-3" /> {world.domain}</span>
        <span className="font-label text-[11px] text-muted-foreground">{world.id}</span>
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
      <div className="mt-5 flex flex-wrap items-center gap-3 text-caption">
        <Link href={`/worlds/${world.id}`} className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring">Open world <Icon name="arrow-right" className="size-3.5" /></Link>
        <Link href="/runs/new" className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring">Run a shift</Link>
        {onDetach && (
          <button type="button" onClick={onDetach} className="ml-auto cursor-pointer text-muted-foreground underline-offset-4 hover:text-danger hover:underline focus-visible:outline-2 focus-visible:outline-ring">Detach</button>
        )}
      </div>
    </article>
  );
}
