import { listPackIds, loadPack } from "@/engine/pack";
import { toPackOption, type PackOption } from "@/lib/summaries";
import { listRuns } from "@/runner/store";
import { RunPage } from "@/ui/RunPage";

export const dynamic = "force-dynamic";

const packs = (): PackOption[] => listPackIds().map((id) => toPackOption(loadPack(id)));

export default function Home() {
  return <RunPage id={null} initialRun={null} packs={packs()} tools={{}} principalLabel="" recent={listRuns()} />;
}
