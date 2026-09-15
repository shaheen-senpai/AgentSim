// `/worlds` — every World pack on disk (spec §6.2). A server component: it reads the packs
// directly rather than going through `GET /api/worlds`, so there is no round trip.
import type { Metadata } from "next";
import Link from "next/link";
import { loadPacks, toPackSummary } from "@/lib/summaries";
import { Header } from "@/ui/Header";
import { heading, mono } from "@/ui/styles";
import { PackCard } from "@/ui/worlds/PackCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Worlds · AgentSim" };

export default function WorldsPage() {
  // `loadPacks` is the one place a pack hand-edited into an invalid state is skipped rather than
  // thrown; this page is the one that then says which pack, and why.
  const { packs: loaded, broken } = loadPacks();
  const packs = loaded.map(toPackSummary);
  return (
    <div className="min-h-screen text-sm">
      <Header run={null} />
      <main className="p-4 flex flex-col gap-4 max-w-[1200px]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-extrabold tracking-tight">Worlds</h1>
          <p className="text-[12px] text-[#6b6b66]">
            A World pack is the simulated business a Run happens inside: its entities, its seeded rows, its tools and its Scenarios.
          </p>
        </div>

        <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {packs.map((p) => (
            <PackCard key={p.id} summary={p} />
          ))}
          <Link
            href="/worlds/new"
            className="border border-dashed border-[#cfcfcb] rounded p-4 flex flex-col items-center justify-center gap-1 text-[#6b6b66] hover:border-[#1d1d1b] hover:text-[#1d1d1b] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1d1d1b] min-h-[140px]"
          >
            <span className="text-lg leading-none">+</span>
            <span className="text-[13px] font-semibold">New world</span>
            <span className="text-[11px]">from a template, or generated</span>
          </Link>
        </div>

        {packs.length === 0 && broken.length === 0 && (
          <p className="text-[13px] text-[#6b6b66]">
            No World packs found under <span className={mono}>worldpacks/</span>.
          </p>
        )}

        {broken.length > 0 && (
          <section className="border border-[#c8321e] bg-[#fbeeea] rounded p-3 flex flex-col gap-1">
            <h2 className={heading}>Packs that failed to load</h2>
            {broken.map((b) => (
              <div key={b.id} className="text-[12px]">
                <span className={`${mono} font-semibold text-[#c8321e]`}>{b.id}</span>
                <pre className={`${mono} text-[11px] whitespace-pre-wrap text-[#1d1d1b]`}>{b.message}</pre>
              </div>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
