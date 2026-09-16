// `/worlds/new` — the two routes to a new World pack (spec §6.2). A Server Component that does
// nothing but gather what the client island cannot reach: the installed packs it may copy, and the
// minimal skeleton, which is the worked example embedded in `docs/worldpack-format.md` — the same
// text the generator shows Claude, so the template and the prompt can never drift apart.
import type { Metadata } from "next";
import Link from "next/link";
import { listPackIds, loadPack } from "@/engine/pack";
import { examplePackFiles, loadFormatDoc } from "@/generate/formatDoc";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { NewWorld, type Template } from "@/ui/worlds/NewWorld";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New world · AgentSim" };

/** Every pack that loads, as a copyable template. One that no longer parses is simply not offered. */
function templates(): Template[] {
  const out: Template[] = [];
  for (const id of listPackIds()) {
    try {
      out.push({ id, name: loadPack(id).meta.name });
    } catch {
      // `/worlds` already reports it; a broken pack is a bad thing to copy.
    }
  }
  return out;
}

export default function NewWorldPage() {
  return (
    <ConsoleShell>
      <main className="p-4 flex flex-col gap-4 max-w-[1200px]">
        <div className="flex items-baseline gap-3">
          <h1 className="text-[17px] font-extrabold tracking-tight">New world</h1>
          <Link href="/worlds" className="text-[12px] text-[#6E6B60] underline decoration-dotted hover:text-[#1B1A17]">
            ← All worlds
          </Link>
        </div>
        <p className="text-[12px] text-[#6E6B60] max-w-[80ch]">
          A World pack is the simulated business a Run happens inside. Copy one that already works, or describe a domain and let Claude draft it from
          your schema, tool list or OpenAPI spec — then review it before it is created.
        </p>
        <NewWorld templates={templates()} skeleton={examplePackFiles(loadFormatDoc())} />
      </main>
    </ConsoleShell>
  );
}
