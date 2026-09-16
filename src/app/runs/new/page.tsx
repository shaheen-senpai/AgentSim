import { loadPacks, toWizardPack } from "@/lib/summaries";
import { listAgents } from "@/runner/agentRegistry";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { NewRunWizard } from "@/ui/wizard/NewRunWizard";

export const dynamic = "force-dynamic";

export default function NewRun() {
  const packs = loadPacks().packs.map(toWizardPack);
  return (
    <ConsoleShell>
      <NewRunWizard packs={packs} agents={listAgents()} />
    </ConsoleShell>
  );
}
