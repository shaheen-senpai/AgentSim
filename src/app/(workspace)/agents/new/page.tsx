// `/agents/new` — the create wizard, aimed at an agent. Server Component: gathers the provider
// catalogs and installed packs the composer offers.
import type { Metadata } from "next";
import { listProviders } from "@/lib/providers";
import { loadPacks } from "@/lib/summaries";
import { CreateWizard } from "@/workspace/wizard/CreateWizard";
import { toPackPicks } from "@/workspace/wizard/packPicks";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "New agent · AgentSim" };

export default function NewAgentRoute() {
  return <CreateWizard target="agent" providers={listProviders()} packs={toPackPicks(loadPacks().packs)} />;
}
