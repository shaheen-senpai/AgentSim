// `/agents/new` — the create wizard, aimed at an agent. Server Component: gathers the provider
// catalogs and installed packs the composer offers.
import type { Metadata } from "next";
import { listProviders } from "@/lib/providers";
import { loadPacks } from "@/lib/summaries";
import { CreateWizard } from "@/workspace/wizard/CreateWizard";
import { toPackPicks } from "@/workspace/wizard/packPicks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New agent · AgentSim" };

export default async function NewAgentRoute({ searchParams }: { searchParams: Promise<{ how?: string | string[] }> }) {
  const { how } = await searchParams;
  const initialHow = (Array.isArray(how) ? how[0] : how) === "plugin" ? "plugin" : null;
  return <CreateWizard target="agent" providers={listProviders()} packs={toPackPicks(loadPacks().packs)} initialHow={initialHow} />;
}
