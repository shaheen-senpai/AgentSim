import { loadPacks, toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

/** `loadPacks` skips a pack that no longer loads, so one bad pack cannot 500 the front door. */
const packs = (): PackOption[] => loadPacks().packs.map(toPackOption);

export default function Home() {
  return <RunPage id={null} initialRun={null} packs={packs()} tools={{}} principalLabel="" injectedLabel="" recent={listRuns()} />;
}
