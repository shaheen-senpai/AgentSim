// `/worlds/new` — compose a World from real sources, or copy a pack. A Server Component that
// gathers what the island cannot reach: the provider catalogs and the installed packs.
import type { Metadata } from "next";
import { listProviders } from "@/lib/providers";
import { loadPacks } from "@/lib/summaries";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { NewWorld } from "@/ui/worlds/newWorld/NewWorld";
import type { PackPick } from "@/ui/worlds/newWorld/sources";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New world · AgentSim Console" };

export default async function NewWorldPage() {
  const packs: PackPick[] = loadPacks().packs.map((p) => ({
    id: p.meta.id,
    name: p.meta.name,
    domain: p.meta.domain,
    description: p.meta.description,
    entities: Object.keys(p.meta.entities).length,
    tools: Object.keys(p.tools).length,
  }));
  return (
    <ConsoleShell>
      <NewWorld providers={listProviders()} packs={packs} />
    </ConsoleShell>
  );
}
