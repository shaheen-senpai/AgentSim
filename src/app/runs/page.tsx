// `/runs` — the console's Runs list. The marketing landing page now owns `/`.
import type { Metadata } from "next";
import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { RunsListPage } from "@/ui/RunsListPage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Runs · AgentSim" };

const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

export default function RunsPage() {
  return (
    <ConsoleShell>
      <RunsListPage runs={listRuns()} packs={packs()} />
    </ConsoleShell>
  );
}
