import { loadPacks, toWizardPack } from "@/lib/summaries";
import { listAgents } from "@/runner/agentRegistry";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { NewRunWizard } from "@/ui/wizard/NewRunWizard";

export const dynamic = "force-dynamic";

export default function NewRun() {
  // Draft Worlds are not offered: `POST /api/runs` refuses them, so listing one here would only
  // walk you through six steps to a 409.
  const all = loadPacks().packs;
  const packs = all.filter((p) => p.meta.status !== "draft").map(toWizardPack);
  return (
    <ConsoleShell>
      <NewRunWizard packs={packs} agents={listAgents()} inReview={all.length - packs.length} />
    </ConsoleShell>
  );
}
