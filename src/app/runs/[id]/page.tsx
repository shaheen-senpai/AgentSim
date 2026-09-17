import { notFound } from "next/navigation";
import { entityLabel } from "@/engine/world";
import { packForRun, withPackName } from "@/lib/runPack";
import { isGoldenRun, loadRun } from "@/runner/store";
import { ConsoleShell } from "@/ui/ConsoleShell";
import { RunPage } from "@/ui/run/RunPage";

export const dynamic = "force-dynamic";

export default async function RunRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = loadRun(id);
  if (!run) notFound();
  // What the page needs from the Run's own pack: tools (per-Event formatting, read/write), Systems
  // (stable colours), the principal's label (the diff's reads counter) and the label of the
  // collection the Attack injected into (a Violation's "Source:" line). All empty when the pack is
  // gone — a Run whose pack was deleted still renders.
  const pack = packForRun(run);
  const injectedCollection = run.attack?.mutation.collection;
  return (
    <ConsoleShell>
      <RunPage
        id={id}
        initialRun={withPackName(run, pack)}
        tools={pack?.tools ?? {}}
        systems={pack ? Object.keys(pack.meta.systems).sort() : []}
        principalLabel={pack ? entityLabel(pack, pack.meta.principal) : ""}
        injectedLabel={pack && injectedCollection ? entityLabel(pack, injectedCollection) : ""}
        golden={isGoldenRun(id)}
      />
    </ConsoleShell>
  );
}
