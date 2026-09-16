import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { RunsListPage } from "@/ui/RunsListPage";

export const dynamic = "force-dynamic";

const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

export default function Home() {
  return (
    <ConsoleShell>
      <RunsListPage runs={listRuns()} packs={packs()} />
    </ConsoleShell>
  );
}
